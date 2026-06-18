<template>
  <div class="op-guide-page">
    <section class="op-guide-hero">
      <div class="op-guide-hero__icon" aria-hidden="true">
        <el-icon :size="28"><Reading /></el-icon>
      </div>
      <div class="op-guide-hero__text">
        <h1 class="op-guide-hero__title">操作指南</h1>
        <p class="op-guide-hero__desc">按任务查步骤，卡住了先看「常见问题」，仍无法解决请用底部企业微信通知工程师。</p>
      </div>
    </section>

    <el-card shadow="never" class="op-guide-toolbar">
      <div class="toolbar-row">
        <el-input
          v-model.trim="keyword"
          clearable
          placeholder="搜索任务，如：录订单、打印报告、开票"
          class="toolbar-search"
          :prefix-icon="Search"
        />
        <div class="toolbar-actions">
          <el-button size="small" @click="expandAll">全部展开</el-button>
          <el-button size="small" @click="collapseAll">全部收起</el-button>
        </div>
      </div>
      <div class="toolbar-groups">
        <button
          v-for="g in groups"
          :key="g.key"
          type="button"
          class="group-chip"
          :class="{ 'is-active': activeGroup === g.key }"
          @click="activeGroup = g.key"
        >
          {{ g.label }}
          <span v-if="groupCounts[g.key]" class="group-chip__count">{{ groupCounts[g.key] }}</span>
        </button>
      </div>
    </el-card>

    <div v-if="filteredTopics.length" class="op-guide-quick">
      <span class="op-guide-quick__label">快速跳转</span>
      <div class="op-guide-quick__list">
        <button
          v-for="topic in filteredTopics"
          :key="topic.name"
          type="button"
          class="quick-chip"
          @click="jumpToTopic(topic.name)"
        >
          {{ topic.title }}
        </button>
      </div>
    </div>

    <el-empty
      v-if="!filteredTopics.length"
      class="op-guide-empty"
      description="没有匹配的任务，请换个关键词或切换分类"
    />

    <el-card v-else shadow="never" class="op-guide-card">
      <el-collapse v-model="activeSections">
        <el-collapse-item
          v-for="topic in filteredTopics"
          :key="topic.name"
          :name="topic.name"
          :id="sectionDomId(topic.name)"
        >
          <template #title>
            <div class="topic-head">
              <span class="topic-head__title">{{ topic.title }}</span>
              <el-tag size="small" effect="plain" class="topic-head__tag">{{ topic.groupLabel }}</el-tag>
            </div>
          </template>

          <p v-if="topic.scenario" class="guide-scenario">{{ topic.scenario }}</p>

          <template v-if="topic.sections">
            <div v-for="(sec, idx) in topic.sections" :key="idx" class="guide-block">
              <p v-if="sec.title" class="guide-subhead">{{ sec.title }}</p>
              <ol class="guide-steps">
                <li v-for="(step, stepIdx) in sec.steps" :key="stepIdx" v-html="step" />
              </ol>
            </div>
          </template>

          <ol v-else-if="topic.steps" class="guide-steps">
            <li v-for="(step, idx) in topic.steps" :key="idx" v-html="step" />
          </ol>

          <ul v-else-if="topic.bullets" class="guide-list">
            <li v-for="(item, idx) in topic.bullets" :key="idx" v-html="item" />
          </ul>

          <dl v-else-if="topic.faq" class="faq-list">
            <div v-for="(item, idx) in topic.faq" :key="idx" class="faq-item">
              <dt>{{ item.q }}</dt>
              <dd v-html="item.a" />
            </div>
          </dl>

          <p v-if="topic.tip" class="guide-tip">{{ topic.tip }}</p>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <SupportContactPanel page-path="/operation-guide" />
  </div>
</template>

<script>
import { Reading, Search } from '@element-plus/icons-vue';
import SupportContactPanel from '../components/SupportContactPanel.vue';

const GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'report', label: '报告与质检' },
  { key: 'sales', label: '订单与合同' },
  { key: 'daily', label: '日常使用' },
  { key: 'faq', label: '常见问题' }
];

const GUIDE_TOPICS = [
  {
    name: 'qc-report',
    group: 'report',
    groupLabel: '报告与质检',
    title: '出具一份检验报告并给客户',
    scenario: '适用：需要新建报告、填写检验数据、打印或发二维码给客户。',
    steps: [
      '左侧点<strong>报告管理</strong> → 右上角<strong>新建报告</strong>。',
      '首次使用可选<strong>套用模板</strong>，或选<strong>空白报告</strong>；填写产品信息、检验项，随时点<strong>保存</strong>。',
      '填写完成后，在列表找到该报告，点<strong>打印</strong>预览；确认公司章、抬头无误后再打印（章和信息在「公司章管理」「公司信息」里维护）。',
      '需要扫码查看时：勾选报告 → 点<strong>生成二维码（合并）</strong> → 到<strong>二维码管理</strong>下载或转发给客户。'
    ],
    tip: '报告作废后，客户扫码会看到「已作废」提示；作废前请确认，重要操作会记入日志。'
  },
  {
    name: 'qc-yearbook',
    group: 'report',
    groupLabel: '报告与质检',
    title: '维护年度成品检验台账',
    scenario: '适用：按年汇总成品检验记录，与单份报告不同，这里是台账表格。',
    steps: [
      '左侧点<strong>品质管控数据</strong>，顶部选择<strong>统计年度</strong>。',
      '批量录入：点<strong>从 Excel 导入</strong>，按页面要求准备文件后上传；导入前确认年份选对。',
      '单条修改：在表格中<strong>双击某一行</strong>，改完后保存。',
      '查找记录：用搜索框输入型号、批号、结论等关键词后查询。'
    ]
  },
  {
    name: 'sales-entry',
    group: 'sales',
    groupLabel: '订单与合同',
    title: '录入一笔新订单',
    scenario: '适用：手工录单、提交审核、跟进状态。',
    steps: [
      '录单前建议先确认：<strong>客户管理</strong>里已有该客户，<strong>内部型号管理</strong>里型号已维护（可减少填错）。',
      '左侧<strong>销售数据 → 订单管理</strong> → 点<strong>手动录入</strong>，填完必填项后保存。',
      '订单保存后，在列表找到该单，打开详情，点<strong>提交审核</strong>（或页面上显示的对应审核按钮）。',
      '之后通过列表<strong>订单状态</strong>或<strong>站内信</strong>了解是否通过、是否被驳回；驳回后按提示修改再提交。'
    ]
  },
  {
    name: 'sales-import',
    group: 'sales',
    groupLabel: '订单与合同',
    title: 'Excel 批量导入订单',
    scenario: '适用：一次导入多笔订单。',
    steps: [
      '在<strong>订单管理</strong>页，点<strong>下载导入模板</strong>，按模板格式填写，不要改列名。',
      '点<strong>Excel 导入</strong>上传文件；成功会提示导入条数。',
      '若失败，系统会列出<strong>第几行、什么原因</strong>（常见：客户不存在、型号未维护、日期格式不对）。',
      '按提示改 Excel 或先在「客户管理」「内部型号管理」补数据，再重新导入。'
    ]
  },
  {
    name: 'sales-contract',
    group: 'sales',
    groupLabel: '订单与合同',
    title: '从订单生成合同并打印',
    scenario: '适用：订单审核通过后，需要出合同给客户。',
    steps: [
      '在<strong>订单管理</strong>勾选一条或多条符合条件的订单。',
      '点<strong>生成合同</strong>，按弹窗提示确认买方、明细与金额。',
      '生成后到<strong>销售数据 → 合同管理</strong>找到该合同，点预览确认正文，再打印或导出。',
      '若金额不对：先查订单明细的数量、单价，再让有权限的同事检查<strong>订单计算规则</strong>；改规则后可能需要重新生成合同。'
    ]
  },
  {
    name: 'invoice',
    group: 'sales',
    groupLabel: '订单与合同',
    title: '申请开票与回填发票',
    scenario: '适用：合同或订单需要开票，通常分「提交申请」和「回填发票」两步完成。',
    sections: [
      {
        title: '一、提交开票申请',
        steps: [
          '进入<strong>销售数据 → 开票中心</strong> → <strong>新增</strong>，填写合同号、金额、买方名称与税号等。',
          '核对无误后<strong>提交</strong>；可多选批量提交。',
          '若被驳回，看<strong>站内信</strong>里的驳回原因，修改后重新提交。'
        ]
      },
      {
        title: '二、回填发票信息',
        steps: [
          '打开<strong>开票中心</strong>，筛选<strong>待开票</strong>。',
          '逐条核对买方信息，回填<strong>发票号码、发票代码、发票链接</strong>，保存后状态变为「已开票」。'
        ]
      }
    ]
  },
  {
    name: 'messages',
    group: 'daily',
    groupLabel: '日常使用',
    title: '收到站内信待办，怎么处理',
    steps: [
      '点右上角<strong>铃铛</strong>；未读消息会有红点。',
      '先看标题和类型（通知 / 待办 / 系统），待办通常需要您操作。',
      '若消息里带链接，<strong>点开消息</strong>可跳到对应订单、开票单等页面。',
      '处理完业务后，消息会自动标记已读；需要归档时可进<strong>销售数据 → 站内信</strong>（若有该菜单）统一管理。'
    ]
  },
  {
    name: 'qr-trouble',
    group: 'report',
    groupLabel: '报告与质检',
    title: '客户扫码打不开报告',
    scenario: '适用：客户反馈二维码无效或页面异常。',
    steps: [
      '让客户确认手机网络正常，换浏览器或 Wi‑Fi 再试。',
      '您在<strong>报告管理</strong>查该报告是否<strong>已作废</strong>；作废单扫码会提示无效。',
      '在<strong>二维码管理</strong>确认二维码仍绑定正确报告。',
      '仍不行：记下二维码编号或报告编号，点本页底部<strong>企业微信通知工程师</strong>。'
    ]
  },
  {
    name: 'admin-backup',
    group: 'daily',
    groupLabel: '日常使用',
    title: '定期备份系统',
    scenario: '需有「安全中心 → 备份与恢复」权限；建议在业务低峰操作。',
    steps: [
      '进入<strong>安全中心 → 备份与恢复</strong>。',
      '点<strong>一键备份</strong>，等待完成后下载备份包并妥善保存。',
      '重要变更（大版本升级、批量删数据）前务必先备份。'
    ],
    tip: '恢复操作会覆盖现有数据，执行前请再次确认；不确定时先联系技术工程师。'
  },
  {
    name: 'ui',
    group: 'daily',
    groupLabel: '日常使用',
    title: '界面与账号：几个常用操作',
    bullets: [
      '<strong>改密码：</strong>右上角姓名 → 修改密码。',
      '<strong>退出：</strong>右上角姓名 → 退出登录（公共电脑务必退出）。',
      '<strong>折叠菜单：</strong>侧栏顶部按钮，节省屏幕宽度。',
      '<strong>查自己做过什么：</strong>左侧<strong>我的操作日志</strong>，一般只显示本人记录。',
      '<strong>换公司章 / 抬头：</strong>分别到「公司章管理」「公司信息」修改，新报告/新打印生效。'
    ]
  },
  {
    name: 'faq',
    group: 'faq',
    groupLabel: '常见问题',
    title: '常见问题',
    faq: [
      {
        q: '忘记密码怎么办？',
        a: '先试登录页「忘记密码」（若有）。不行则找有「员工账号」权限的同事重置，或点本页底部「企业微信通知工程师」。'
      },
      {
        q: '为什么我看不到某个菜单或按钮？',
        a: '系统按账号权限显示功能。把您需要做的操作告诉有权限的同事，请其在「员工类别」或您的账号上勾选对应权限。'
      },
      {
        q: '点某个功能提示「没有权限」？',
        a: '说明能进页面但不能做该操作（例如只能查看、不能提交）。需要单独开通对应操作权限。'
      },
      {
        q: '为什么经常自动退出登录？',
        a: '长时间未操作会超时退出，重新登录即可。若过于频繁，可在「系统安全」中查看会话超时设置（需相应权限）。'
      },
      {
        q: '打印出来章或抬头不对？',
        a: '先在报告/合同里<strong>预览</strong>；再检查「公司章管理」「公司信息」是否已上传并启用；最后用浏览器打印预览调整纸张和边距。'
      },
      {
        q: '订单审核卡在某一步，该怎么处理？',
        a: '看订单当前状态和站内信通知对象；收到待办通知的同事在订单详情里继续操作。流程节点可在「订单管理 → 管理 → 审核流程」查看（需权限）。'
      },
      {
        q: '手机上能用吗？',
        a: '查订单、看消息、简单录入可以；写报告、改合同正文建议在电脑浏览器操作，屏幕大、不易误触。'
      }
    ]
  }
];

function topicSearchText(topic) {
  const parts = [topic.title, topic.scenario, topic.tip];
  if (topic.steps) parts.push(...topic.steps);
  if (topic.bullets) parts.push(...topic.bullets);
  if (topic.sections) {
    topic.sections.forEach((sec) => {
      parts.push(sec.title);
      parts.push(...sec.steps);
    });
  }
  if (topic.faq) {
    topic.faq.forEach((item) => {
      parts.push(item.q, item.a);
    });
  }
  return parts.filter(Boolean).join(' ');
}

export default {
  name: 'OperationGuide',
  components: { SupportContactPanel, Reading },
  data() {
    return {
      Search,
      groups: GROUPS,
      guideTopics: GUIDE_TOPICS,
      keyword: '',
      activeGroup: 'all',
      activeSections: ['faq']
    };
  },
  computed: {
    filteredTopics() {
      const kw = this.keyword.trim().toLowerCase();
      return this.guideTopics.filter((topic) => {
        if (this.activeGroup !== 'all' && topic.group !== this.activeGroup) return false;
        if (!kw) return true;
        return topicSearchText(topic).toLowerCase().includes(kw);
      });
    },
    groupCounts() {
      const kw = this.keyword.trim().toLowerCase();
      const counts = { all: 0 };
      this.groups.forEach((g) => {
        if (g.key !== 'all') counts[g.key] = 0;
      });
      this.guideTopics.forEach((topic) => {
        if (kw && !topicSearchText(topic).toLowerCase().includes(kw)) return;
        counts.all += 1;
        counts[topic.group] = (counts[topic.group] || 0) + 1;
      });
      return counts;
    }
  },
  watch: {
    filteredTopics(list) {
      const names = new Set(list.map((t) => t.name));
      this.activeSections = this.activeSections.filter((n) => names.has(n));
    }
  },
  methods: {
    sectionDomId(name) {
      return `guide-section-${name}`;
    },
    expandAll() {
      this.activeSections = this.filteredTopics.map((t) => t.name);
    },
    collapseAll() {
      this.activeSections = [];
    },
    jumpToTopic(name) {
      if (!this.activeSections.includes(name)) {
        this.activeSections = [...this.activeSections, name];
      }
      this.$nextTick(() => {
        const el = document.getElementById(this.sectionDomId(name));
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }
};
</script>

<style scoped>
.op-guide-page {
  max-width: 920px;
  overflow-x: hidden;
  padding-bottom: 8px;
}

.op-guide-hero {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
  padding: 18px 20px;
  background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 55%, #f8fafc 100%);
  border: 1px solid rgba(34, 197, 94, 0.15);
  border-radius: var(--radius, 14px);
}

.op-guide-hero__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(34, 197, 94, 0.12);
  color: #16a34a;
}

.op-guide-hero__title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
}

.op-guide-hero__desc {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
}

.op-guide-toolbar {
  margin-bottom: 12px;
}

.op-guide-toolbar :deep(.el-card__body) {
  padding: 14px 16px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-search {
  flex: 1;
  min-width: 220px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.toolbar-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.group-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}

.group-chip:hover {
  border-color: #86efac;
  color: #15803d;
}

.group-chip.is-active {
  border-color: #22c55e;
  background: #f0fdf4;
  color: #15803d;
  font-weight: 600;
}

.group-chip__count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.group-chip.is-active .group-chip__count {
  background: rgba(34, 197, 94, 0.18);
}

.op-guide-quick {
  margin-bottom: 12px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid var(--border, rgba(15, 23, 42, 0.08));
  border-radius: 12px;
}

.op-guide-quick__label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.op-guide-quick__list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-chip {
  max-width: 100%;
  padding: 5px 10px;
  border: none;
  border-radius: 8px;
  background: #f1f5f9;
  color: #334155;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
}

.quick-chip:hover {
  background: #dcfce7;
  color: #166534;
}

.op-guide-empty {
  margin: 24px 0;
}

.op-guide-card {
  margin-bottom: 16px;
}

.op-guide-card :deep(.el-card__body) {
  padding: 8px 12px 12px;
}

.op-guide-card :deep(.el-collapse) {
  border: none;
}

.op-guide-card :deep(.el-collapse-item) {
  scroll-margin-top: 72px;
}

.op-guide-card :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 48px;
  padding: 10px 4px;
  line-height: 1.45;
  border-bottom-color: #f1f5f9;
  font-weight: 600;
}

.op-guide-card :deep(.el-collapse-item__wrap) {
  border-bottom-color: #f1f5f9;
}

.op-guide-card :deep(.el-collapse-item__content) {
  padding-bottom: 16px;
}

.topic-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-right: 8px;
}

.topic-head__title {
  color: #0f172a;
  font-size: 15px;
}

.topic-head__tag {
  flex-shrink: 0;
}

.guide-scenario {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
  background: #f8fafc;
  border-radius: 8px;
}

.guide-block + .guide-block {
  margin-top: 12px;
}

.guide-subhead {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.guide-steps {
  counter-reset: guide-step;
  margin: 0;
  padding: 0;
  list-style: none;
}

.guide-steps li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  color: #334155;
  line-height: 1.65;
}

.guide-steps li + li {
  margin-top: 10px;
}

.guide-steps li::before {
  counter-increment: guide-step;
  content: counter(guide-step);
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #ecfdf5;
  color: #15803d;
  font-size: 12px;
  font-weight: 700;
  line-height: 24px;
  text-align: center;
}

.guide-tip {
  margin: 14px 0 0;
  padding: 10px 12px;
  font-size: 13px;
  color: #475569;
  line-height: 1.55;
  background: #fffbeb;
  border-radius: 8px;
  border-left: 3px solid #fbbf24;
}

.guide-list {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  color: #334155;
  line-height: 1.65;
}

.guide-list li + li {
  margin-top: 8px;
}

.faq-list {
  margin: 0;
}

.faq-item + .faq-item {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed #e2e8f0;
}

.faq-list dt {
  font-weight: 600;
  color: #0f172a;
  font-size: 14px;
}

.faq-list dd {
  margin: 6px 0 0;
  padding: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.65;
}

@media (max-width: 992px) {
  .op-guide-page {
    max-width: 100%;
  }

  .op-guide-hero {
    padding: 14px;
  }

  .op-guide-hero__title {
    font-size: 18px;
  }

  .toolbar-row {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-actions {
    width: 100%;
  }

  .toolbar-actions .el-button {
    flex: 1;
  }
}
</style>
