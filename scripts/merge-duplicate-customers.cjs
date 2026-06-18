/**
 * 合并重复客户脚本
 *
 * Pass 1：按 customer_name 精确重复分组合并（保留有 contact_name 的）
 * Pass 2：跨字段匹配——短记录 customer_name == 完整记录 contact_name
 *         例：id=436 customer_name="华信"  vs  id=144 customer_name="昆明华信…" contact_name="华信"
 *         保留完整记录（有全称+简称的），删除短记录
 *
 * 用法：node scripts/merge-duplicate-customers.cjs [--dry-run]
 */

const { createRequire } = require('module');
const requireFromServer = createRequire(require('path').join(__dirname, '../server/package.json'));
const mysql = requireFromServer('mysql2/promise');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT) || 3306,
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASS || process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || 'admin',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'qc_report',
    waitForConnections: true,
    connectionLimit: 5
  });

  try {
    // 找到所有 customer_name 重复的组（排除空名称）
    const [dupGroups] = await pool.query(`
      SELECT customer_name, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id) AS ids
      FROM sales_customers
      WHERE customer_name != ''
      GROUP BY customer_name
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
    `);

    if (!dupGroups.length) {
      console.log('Pass 1：没有发现 customer_name 精确重复的客户。');
    }

    console.log(`发现 ${dupGroups.length} 组重复客户名称：\n`);

    let totalMerged = 0;
    let totalDeleted = 0;

    for (const group of dupGroups) {
      const ids = group.ids.split(',').map(Number);

      // 获取这组客户的完整信息
      const [customers] = await pool.query(
        `SELECT id, customer_code, customer_name, contact_name, created_at
         FROM sales_customers WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`,
        ids
      );

      // 选择保留的客户：优先保留有简称的，否则保留 id 最小的
      let keeper = customers.find(c => c.contact_name && c.contact_name.trim());
      if (!keeper) keeper = customers[0]; // 都没简称，保留最早的

      const toDelete = customers.filter(c => c.id !== keeper.id);

      // 统计关联数据
      const stats = {};
      for (const c of [keeper, ...toDelete]) {
        const [[{ order_cnt }]] = await pool.query('SELECT COUNT(*) AS order_cnt FROM sales_orders WHERE customer_id = ?', [c.id]);
        const [[{ contract_cnt }]] = await pool.query('SELECT COUNT(*) AS contract_cnt FROM sales_contracts WHERE customer_id = ?', [c.id]);
        const [[{ mapping_cnt }]] = await pool.query('SELECT COUNT(*) AS mapping_cnt FROM sales_customer_model_mappings WHERE customer_id = ?', [c.id]);
        const [[{ price_cnt }]] = await pool.query('SELECT COUNT(*) AS price_cnt FROM customer_prices WHERE customer_id = ?', [c.id]);
        stats[c.id] = { order_cnt, contract_cnt, mapping_cnt, price_cnt };
      }

      console.log(`【${group.customer_name}】`);
      for (const c of customers) {
        const s = stats[c.id];
        const tag = c.id === keeper.id ? ' ← 保留' : ' ← 删除';
        console.log(`  id=${c.id}  code=${c.customer_code}  简称=${c.contact_name || '(空)'}  订单=${s.order_cnt}  合同=${s.contract_cnt}  映射=${s.mapping_cnt}  单价=${s.price_cnt}${tag}`);
      }

      if (DRY_RUN) {
        console.log('  [dry-run] 跳过实际操作\n');
        totalMerged++;
        continue;
      }

      // 开始事务
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        for (const dup of toDelete) {
          // 转移订单
          const [orderResult] = await conn.query(
            'UPDATE sales_orders SET customer_id = ? WHERE customer_id = ?',
            [keeper.id, dup.id]
          );
          if (orderResult.affectedRows > 0) {
            console.log(`  转移 ${orderResult.affectedRows} 条订单 id=${dup.id}→${keeper.id}`);
          }

          // 转移合同
          const [contractResult] = await conn.query(
            'UPDATE sales_contracts SET customer_id = ? WHERE customer_id = ?',
            [keeper.id, dup.id]
          );
          if (contractResult.affectedRows > 0) {
            console.log(`  转移 ${contractResult.affectedRows} 条合同 id=${dup.id}→${keeper.id}`);
          }

          // 转移型号映射（注意唯一键冲突）
          const [dupMappings] = await conn.query(
            'SELECT id, customer_model, internal_model FROM sales_customer_model_mappings WHERE customer_id = ?',
            [dup.id]
          );
          for (const m of dupMappings) {
            const [[existing]] = await conn.query(
              'SELECT id FROM sales_customer_model_mappings WHERE customer_id = ? AND customer_model = ? AND internal_model = ?',
              [keeper.id, m.customer_model, m.internal_model]
            );
            if (existing) {
              // 保留客户已有相同映射，直接删除重复的
              await conn.query('DELETE FROM sales_customer_model_mappings WHERE id = ?', [m.id]);
            } else {
              await conn.query(
                'UPDATE sales_customer_model_mappings SET customer_id = ? WHERE id = ?',
                [keeper.id, m.id]
              );
            }
          }
          if (dupMappings.length > 0) {
            console.log(`  转移/合并 ${dupMappings.length} 条型号映射 id=${dup.id}→${keeper.id}`);
          }

          // 转移单价（注意唯一键冲突：同一 keeper 已有相同 product_model 时保留 keeper 的价格）
          const [dupPrices] = await conn.query(
            'SELECT id, product_model, unit_price FROM customer_prices WHERE customer_id = ?',
            [dup.id]
          );
          for (const p of dupPrices) {
            const [[existing]] = await conn.query(
              'SELECT id FROM customer_prices WHERE customer_id = ? AND product_model = ?',
              [keeper.id, p.product_model]
            );
            if (existing) {
              await conn.query('DELETE FROM customer_prices WHERE id = ?', [p.id]);
            } else {
              await conn.query(
                'UPDATE customer_prices SET customer_id = ? WHERE id = ?',
                [keeper.id, p.id]
              );
            }
          }
          if (dupPrices.length > 0) {
            console.log(`  转移/合并 ${dupPrices.length} 条单价 id=${dup.id}→${keeper.id}`);
          }

          // 删除重复客户
          await conn.query('DELETE FROM sales_customers WHERE id = ?', [dup.id]);
          console.log(`  已删除重复客户 id=${dup.id} (${dup.customer_code})`);
          totalDeleted++;
        }

        await conn.commit();
        totalMerged++;
        console.log('');
      } catch (e) {
        await conn.rollback();
        console.error(`  合并失败: ${e.message}\n`);
      } finally {
        conn.release();
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // Pass 2：跨字段匹配——短记录 customer_name == 完整记录 contact_name
    // ═══════════════════════════════════════════════════════════════
    const [crossDupes] = await pool.query(`
      SELECT a.id AS short_id, a.customer_name AS short_name, a.contact_name AS short_contact,
             b.id AS full_id, b.customer_name AS full_name, b.contact_name AS full_contact
      FROM sales_customers a
      JOIN sales_customers b
        ON a.customer_name = b.contact_name
       AND a.id <> b.id
      WHERE NULLIF(TRIM(b.contact_name), '') IS NOT NULL
        AND b.customer_name <> b.contact_name
      ORDER BY b.customer_name, a.id
    `);

    if (crossDupes.length) {
      console.log(`\n═══ Pass 2：发现 ${crossDupes.length} 组跨字段重复（customer_name ↔ contact_name）═══\n`);

      // 按 full_id 分组（一个完整记录可能对应多个短记录）
      const byFull = new Map();
      for (const r of crossDupes) {
        if (!byFull.has(r.full_id)) byFull.set(r.full_id, { full_name: r.full_name, full_contact: r.full_contact, shorts: [] });
        byFull.get(r.full_id).shorts.push(r);
      }

      for (const [fullId, group] of byFull) {
        const shortIds = group.shorts.map(s => s.short_id);
        console.log(`【${group.full_name}】(id=${fullId}) ← 合并 ${shortIds.length} 个短记录`);

        // 统计完整客户的关联数据
        const [[{ order_cnt: keeperOrders }]] = await pool.query('SELECT COUNT(*) AS order_cnt FROM sales_orders WHERE customer_id = ?', [fullId]);
        const [[{ contract_cnt: keeperContracts }]] = await pool.query('SELECT COUNT(*) AS contract_cnt FROM sales_contracts WHERE customer_id = ?', [fullId]);
        console.log(`  保留 id=${fullId}  全称="${group.full_name}"  简称="${group.full_contact}"  订单=${keeperOrders}  合同=${keeperContracts}`);

        for (const r of group.shorts) {
          const [[{ order_cnt }]] = await pool.query('SELECT COUNT(*) AS order_cnt FROM sales_orders WHERE customer_id = ?', [r.short_id]);
          const [[{ contract_cnt }]] = await pool.query('SELECT COUNT(*) AS contract_cnt FROM sales_contracts WHERE customer_id = ?', [r.short_id]);
          const [[{ mapping_cnt }]] = await pool.query('SELECT COUNT(*) AS mapping_cnt FROM sales_customer_model_mappings WHERE customer_id = ?', [r.short_id]);
          const [[{ price_cnt }]] = await pool.query('SELECT COUNT(*) AS price_cnt FROM customer_prices WHERE customer_id = ?', [r.short_id]);
          console.log(`  短记录 id=${r.short_id}  name="${r.short_name}"  订单=${order_cnt}  合同=${contract_cnt}  映射=${mapping_cnt}  单价=${price_cnt}  ← 删除`);
        }

        if (DRY_RUN) {
          console.log('  [dry-run] 跳过实际操作\n');
          totalMerged++;
          continue;
        }

        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          for (const shortId of shortIds) {
            // 转移订单
            const [orderResult] = await conn.query(
              'UPDATE sales_orders SET customer_id = ? WHERE customer_id = ?',
              [fullId, shortId]
            );
            if (orderResult.affectedRows > 0) {
              console.log(`  转移 ${orderResult.affectedRows} 条订单 ${shortId}→${fullId}`);
            }

            // 转移合同
            const [contractResult] = await conn.query(
              'UPDATE sales_contracts SET customer_id = ? WHERE customer_id = ?',
              [fullId, shortId]
            );
            if (contractResult.affectedRows > 0) {
              console.log(`  转移 ${contractResult.affectedRows} 条合同 ${shortId}→${fullId}`);
            }

            // 转移型号映射
            const [dupMappings] = await conn.query(
              'SELECT id, customer_model, internal_model FROM sales_customer_model_mappings WHERE customer_id = ?',
              [shortId]
            );
            for (const m of dupMappings) {
              const [[existing]] = await conn.query(
                'SELECT id FROM sales_customer_model_mappings WHERE customer_id = ? AND customer_model = ? AND internal_model = ?',
                [fullId, m.customer_model, m.internal_model]
              );
              if (existing) {
                await conn.query('DELETE FROM sales_customer_model_mappings WHERE id = ?', [m.id]);
              } else {
                await conn.query(
                  'UPDATE sales_customer_model_mappings SET customer_id = ? WHERE id = ?',
                  [fullId, m.id]
                );
              }
            }

            // 转移单价
            const [dupPrices] = await conn.query(
              'SELECT id, product_model, unit_price FROM customer_prices WHERE customer_id = ?',
              [shortId]
            );
            for (const p of dupPrices) {
              const [[existing]] = await conn.query(
                'SELECT id FROM customer_prices WHERE customer_id = ? AND product_model = ?',
                [fullId, p.product_model]
              );
              if (existing) {
                await conn.query('DELETE FROM customer_prices WHERE id = ?', [p.id]);
              } else {
                await conn.query(
                  'UPDATE customer_prices SET customer_id = ? WHERE id = ?',
                  [fullId, p.id]
                );
              }
            }

            // 删除短记录
            await conn.query('DELETE FROM sales_customers WHERE id = ?', [shortId]);
            console.log(`  已删除短记录 id=${shortId}`);
            totalDeleted++;
          }

          await conn.commit();
          totalMerged++;
          console.log('');
        } catch (e) {
          await conn.rollback();
          console.error(`  合并失败: ${e.message}\n`);
        } finally {
          conn.release();
        }
      }
    } else {
      console.log('\nPass 2：未发现跨字段重复。');
    }

    console.log(`\n完成：处理 ${totalMerged} 组，删除 ${totalDeleted} 个重复客户。`);
    if (DRY_RUN) console.log('(以上为 dry-run 模拟结果，未实际修改数据)');
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
