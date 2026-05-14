<template>
  <div class="wecom-page">
    <el-alert
      v-if="metaHint"
      type="info"
      :closable="false"
      class="mb-3"
      :title="metaHint"
    />
    <el-alert type="success" :closable="false" class="mb-3" title="系统自动推送（销售订单）">
      模板代码 <code>sales_order_submit_finance</code>（提交财务审核）、<code>sales_order_withdraw_finance</code>（撤回审核）、
      <code>sales_order_rejected_sales</code>（财务驳回至创建销售，正文含订单摘要与驳回原因）；正文变量含
      <code>detail</code>（与站内信相同摘要）、<code>orderNo</code>、<code>count</code>、<code>fromUser</code>。
      提交/撤回接收人：公司「快捷财务」或财务类别且已填企业微信 UserID 的成员；驳回接收人为订单创建人（须维护 UserID）。
    </el-alert>
    <el-alert type="success" :closable="false" class="mb-3" title="财务通过 → 仓库（销售订单）">
      模板 <code>sales_order_approved_warehouse</code> 须为<strong>文本卡片</strong>：财务通过时<strong>按订单逐条</strong>推送企业微信，正文含厂家、标签型号、仓库型号、规格、批号、数量、备注；占位符除
      <code>detail</code>、<code>orderNo</code>、<code>count</code>、<code>fromUser</code> 外，「链接地址」须使用
      <span v-pre><code>{{shipConfirmUrl}}</code></span>（打开确认页，避免点卡片正文即发货）；<code>shipUrl</code> 与同变量等价（兼容旧模板），确认页内「完成发货」通过表单 <strong>POST</strong>
      <code>/api/public/wecom-order-ship</code> 执行发货（GET 已停用）。
      服务器需配置与外网一致的 <code>PUBLIC_BASE_URL</code> 及 <code>JWT_SECRET</code>；在确认页点击「完成发货」才把该单更新为「已发货」（无需登录）。升级请执行迁移
      <code>025_wecom_warehouse_ship_textcard.sql</code>、<code>029_wecom_warehouse_ship_confirm_page.sql</code>。
      <strong>若点击后提示「无法打开页面」：</strong>多为企业微信拦截非 HTTPS 或未加入可信域名——请用 HTTPS 域名（反代到本服务）、在企业微信后台把<strong>主机名</strong>配进应用可信网页域名（勿填协议头；不支持 IP、短链）；可先在同一网络用手机系统浏览器访问
      「与 .env 中 <code>PUBLIC_BASE_URL</code> 相同根地址」<code>/api/public/wecom-order-ship-probe</code>（应返回纯文本
      <code>wecom-ship-probe-ok</code>）确认手机能否到达本服务。服务端默认监听 <code>0.0.0.0</code>（可用 <code>LISTEN_HOST</code> 覆盖）。
    </el-alert>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="企业与应用绑定" name="cfg">
        <el-form label-width="140px" class="form-block" @submit.prevent>
          <el-form-item label="接收消息 URL">
            <div class="callback-row">
              <el-input :model-value="displayCallbackUrl" readonly />
              <el-button @click="copyText(displayCallbackUrl)">复制</el-button>
            </div>
            <div class="field-tip">
              企业微信后台填写的必须是「根地址 + <code>/api/wecom/callback</code>」，与上方一致。
              可先访问「自检地址」确认穿透到达本服务：浏览器打开
              <code>{{ displayProbeUrl || '（先填公网根地址）' }}</code> 应看到纯文本
              <code>wecom-callback-probe-ok</code>。
              <strong>loca.lt / localtunnel</strong> 常对<strong>非浏览器请求</strong>返回拦截页，企业微信服务器无法完成验签，需换
              frp、Cloudflare Tunnel、ngrok、云服务器公网 IP 等无拦截的 HTTPS 入口。
            </div>
          </el-form-item>
          <el-form-item label="公网根地址（可选）">
            <el-input
              v-model="callbackBaseOverride"
              clearable
              placeholder="https://你的穿透或域名，无尾斜杠"
            />
          </el-form-item>
          <el-form-item label="回调 Token">
            <el-input
              v-model="cfgForm.receiveToken"
              clearable
              placeholder="与自建应用「设置 API 接收」一致；已保存则留空不改，填写新值则更新"
            />
            <div class="field-tip">
              <span v-if="receiveTokenConfigured" class="text-ok">当前已保存回调 Token（接口不回显原文）</span>
              <el-button link type="danger" size="small" @click="markClearReceiveToken">清除已存 Token</el-button>
            </div>
          </el-form-item>
          <el-form-item label="EncodingAESKey">
            <el-input
              v-model="cfgForm.encodingAesKeyNew"
              type="password"
              show-password
              clearable
              maxlength="43"
              placeholder="43 位，与后台一致；已配置可不填；清除请点右侧按钮"
            />
            <div class="field-tip">
              <span v-if="encodingAesKeyConfigured" class="text-ok">当前已保存密钥（留空提交则不修改）</span>
              <el-button link type="danger" size="small" @click="markClearAesKey">清除已存密钥</el-button>
            </div>
          </el-form-item>
          <el-form-item label="企业 ID (corpId)">
            <el-input v-model="cfgForm.corpId" placeholder="在企业微信管理后台「我的企业」可见" clearable />
          </el-form-item>
          <el-form-item label="应用 AgentId">
            <el-input-number v-model="cfgForm.agentId" :min="0" :controls="true" class="w-full-num" />
          </el-form-item>
          <el-form-item label="应用 Secret">
            <el-input
              v-model="cfgForm.corpSecret"
              type="password"
              show-password
              :placeholder="cfgLoaded && secretConfigured ? '已配置，留空不改；填新值则更新' : '必填，应用凭证密钥'"
              clearable
            />
          </el-form-item>
          <el-form-item label="备注">
            <el-input v-model="cfgForm.remark" type="textarea" :rows="2" placeholder="可选" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="cfgSaving" @click="saveConfig" icon=Check>保存绑定信息</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>
      <el-tab-pane label="通知对象（成员 UserID）" name="recv">
        <div class="toolbar">
          <el-button type="primary" @click="openRecipientDialog()" icon=Plus>新增对象</el-button>
        </div>
        <el-table :data="recipients" border stripe>
          <el-table-column prop="nameZh" label="名称" min-width="120" />
          <el-table-column label="成员 UserID" min-width="220">
            <template #default="{ row }">
              <span class="mono">{{ (row.wecomUserids || []).join(' | ') }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" label="排序" width="80" />
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openRecipientDialog(row)" icon=Edit>编辑</el-button>
              <el-button link type="danger" @click="removeRecipient(row)" icon=Delete>删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <el-tab-pane label="消息模板与调用代码" name="tpl">
        <p class="tab-lead">
          <strong>消息模板</strong>决定推送到企业微信时长的样子。编辑时用「占位符」
          <code v-pre>{{变量名}}</code>，真正发送时由系统或接口传入具体文字（见下方「可插入变量」）。
        </p>
        <div class="toolbar">
          <el-button type="primary" @click="openTemplateDialog()" icon=Plus>新建模板</el-button>
        </div>
        <div class="tpl-two-cols">
          <el-card shadow="never" class="catalog-card">
            <template #header>模板代码清单（系统约定）</template>
            <el-table :data="templateCodeCatalog" border size="small" stripe>
              <el-table-column prop="code" label="模板代码" width="240">
                <template #default="{ row }"><code>{{ row.code }}</code></template>
              </el-table-column>
              <el-table-column prop="meaning" label="含义" min-width="220" />
              <el-table-column label="使用位置" min-width="260">
                <template #default="{ row }">{{ (row.usedBy || []).join('、') || '—' }}</template>
              </el-table-column>
            </el-table>
          </el-card>
          <el-card shadow="never" class="templates-card">
            <template #header>消息模板列表</template>
            <el-table :data="templates" border stripe>
              <el-table-column prop="code" label="模板代码" width="150">
                <template #default="{ row }">
                  <code>{{ row.code }}</code>
                </template>
              </el-table-column>
              <el-table-column prop="nameZh" label="显示名称" min-width="120" />
              <el-table-column label="消息形态" width="120">
                <template #default="{ row }">
                  {{ msgTypeLabel(row.msgType) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" width="280" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openSnippet(row)">调用代码</el-button>
                  <el-button link type="primary" @click="openTestSend(row)" icon=Promotion>测试发送</el-button>
                  <el-button link type="primary" @click="openTemplateDialog(row)" icon=Edit>编辑</el-button>
                  <el-button link type="danger" @click="removeTemplate(row)" icon=Delete>删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </el-tab-pane>
      <el-tab-pane label="发送记录" name="jobs">
        <p class="tab-lead">
          系统自动推送（订单/合同）经队列异步发往企业微信；此处可查看状态、失败原因，并对失败/死信任务手动重试。
          环境变量 <code>WECOM_NOTIFY_WORKER_DISABLED=true</code> 可关闭本机 worker（需另行部署消费进程时再用）。
        </p>
        <div class="toolbar jobs-toolbar">
          <el-select v-model="jobFilterStatus" placeholder="状态" clearable style="width: 140px" @change="jobsPage = 1; loadJobs()">
            <el-option label="全部状态" value="" />
            <el-option label="待发送" value="pending" />
            <el-option label="发送中" value="sending" />
            <el-option label="已发送" value="sent" />
            <el-option label="失败" value="failed" />
            <el-option label="死信" value="dead" />
          </el-select>
          <el-input
            v-model="jobFilterTemplateCode"
            clearable
            placeholder="模板代码"
            style="width: 200px"
            @keyup.enter="jobsPage = 1; loadJobs()"
          />
          <el-input
            v-model="jobFilterBizType"
            clearable
            placeholder="业务类型"
            style="width: 140px"
            @keyup.enter="jobsPage = 1; loadJobs()"
          />
          <el-input
            v-model="jobFilterBizId"
            clearable
            placeholder="业务ID"
            style="width: 120px"
            @keyup.enter="jobsPage = 1; loadJobs()"
          />
          <el-button type="primary" :loading="jobsLoading" @click="jobsPage = 1; loadJobs()">查询</el-button>
        </div>
        <el-table :data="jobs" border stripe v-loading="jobsLoading">
          <el-table-column prop="id" label="ID" width="72" />
          <el-table-column prop="bizType" label="业务类型" width="120">
            <template #default="{ row }">{{ row.bizType || '—' }}</template>
          </el-table-column>
          <el-table-column prop="bizId" label="业务ID" width="88">
            <template #default="{ row }">{{ row.bizId != null ? row.bizId : '—' }}</template>
          </el-table-column>
          <el-table-column prop="templateCode" label="模板代码" min-width="160">
            <template #default="{ row }"><code>{{ row.templateCode }}</code></template>
          </el-table-column>
          <el-table-column label="接收人" min-width="140">
            <template #default="{ row }">
              <span class="mono" :title="row.toUserPreview">{{ row.toUserPreview }}</span>
              <span v-if="row.toUserRecipientCount > 1" class="text-muted">（{{ row.toUserRecipientCount }}人）</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="88" />
          <el-table-column label="重试" width="72">
            <template #default="{ row }">{{ row.retryCount }}/{{ row.maxRetries }}</template>
          </el-table-column>
          <el-table-column prop="lastError" label="最后错误" min-width="160" show-overflow-tooltip />
          <el-table-column prop="createdAt" label="创建时间" width="168">
            <template #default="{ row }">{{ formatJobTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column prop="sentAt" label="发送时间" width="168">
            <template #default="{ row }">{{ formatJobTime(row.sentAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="88" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'failed' || row.status === 'dead'"
                link
                type="primary"
                size="small"
                :loading="row._retrying"
                @click="retryJob(row)"
              >
                重试
              </el-button>
              <span v-else class="text-muted">—</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="jobs-pagination">
          <el-pagination
            v-model:current-page="jobsPage"
            v-model:page-size="jobsPageSize"
            :total="jobsTotal"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next"
            @current-change="loadJobs"
            @size-change="jobsPage = 1; loadJobs()"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="recipientDlg" :title="recipientEditId ? '编辑通知对象' : '新增通知对象'" width="520px" destroy-on-close>
      <el-form label-width="120px">
        <el-form-item label="名称" required>
          <el-input v-model="recipientForm.nameZh" placeholder="如：仓库负责人" />
        </el-form-item>
        <el-form-item label="成员 UserID" required>
          <el-input
            v-model="recipientForm.userIdsText"
            type="textarea"
            :rows="4"
            placeholder="企业微信通讯录中的成员账号，多个可用换行、英文逗号或竖线分隔"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="recipientForm.sortOrder" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recipientDlg = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="recipientSaving" @click="saveRecipient" icon=Check>保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="templateDlg"
      :title="templateEditId ? '编辑消息模板' : '新建消息模板'"
      width="760px"
      top="5vh"
      class="template-dialog"
      destroy-on-close
      @closed="resetTemplateForm"
    >
      <el-alert v-if="systemTemplateSchemaHint" type="warning" :closable="false" show-icon class="mb-2">
        <template #title>系统模板校验</template>
        {{ systemTemplateSchemaHint }}
      </el-alert>
      <el-alert type="info" :closable="false" show-icon class="template-intro">
        <template #title>怎么写占位符</template>
        <div class="template-intro-body">
          在内容里输入 <code v-pre>{{detail}}</code> 表示「这里以后换成真实内容」。发送时用同名变量传入，例如
          <code>detail</code>、<code>orderNo</code>。下面按钮可一键插入，避免手打拼错。
          若选<strong>文本卡片</strong>，「链接地址」替换后必须是带 <code>https://</code> 的完整链接。
          填 <code v-pre>{{reviewUrl}}</code> 时，真实发送由服务端填入；在<strong>测试发送</strong>里须在 JSON 中自行传入
          <code>reviewUrl</code>，否则会报 <strong>41010 missing url</strong>。
        </div>
      </el-alert>

      <el-form label-width="132px" class="template-form">
        <el-form-item label="显示名称" required>
          <el-input v-model="templateForm.nameZh" placeholder="如：财务待审通知（列表中展示；也用于生成模板代码）" />
        </el-form-item>
        <el-form-item v-if="!templateEditId" label="模板代码" required>
          <div class="code-generate-row">
            <el-input
              v-model="templateForm.code"
              placeholder="可手填，如 sales_contract_submit_reviewer"
              @input="onTemplateCodeManualInput"
            />
            <el-button type="primary" plain @click="generateTemplateCode">自动生成</el-button>
          </div>
          <div class="field-tip">
            可手动输入，也可自动生成。若你手动改过代码，后续改显示名称时不会自动覆盖。
          </div>
        </el-form-item>
        <el-form-item v-else label="模板代码">
          <el-input :model-value="templateForm.code" disabled />
          <div class="field-tip">代码已保存，一般不再修改，避免已有接口找不到模板。</div>
        </el-form-item>

        <el-divider content-position="left">消息长什么样</el-divider>
        <el-form-item label="消息形态" required>
            <el-radio-group v-model="templateForm.msgType" class="msg-type-radios">
            <el-radio label="text" border>
              <span class="msg-type-title">纯文本</span>
              <span class="msg-type-desc">企业微信里一整段普通文字，最简单。</span>
            </el-radio>
            <el-radio label="markdown" border>
              <span class="msg-type-title">Markdown</span>
              <span class="msg-type-desc">支持部分加粗、标题等（与企业微信说明一致）。</span>
            </el-radio>
            <el-radio label="textcard" border>
              <span class="msg-type-title">文本卡片</span>
              <span class="msg-type-desc">带标题、灰色摘要、底部「详情」按钮点开链接。</span>
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="可插入变量">
          <div class="var-chips">
            <el-button
              v-for="v in templateVariableList"
              :key="v.key"
              size="small"
              @click="insertVariableToField('bodyTemplate', v.key)"
            >
              {{ varChipButtonText(v) }}
            </el-button>
          </div>
          <div class="field-tip">
            销售系统自动推送已约定：<code>detail</code>（长摘要）、<code>orderNo</code>、<code>contractNo</code>、<code>customerName</code>、<code>reviewUrl</code>（合同待审：移动端审批页 HTTPS 链接，可插入正文或文本卡片 url）、<code>contractReviewStatus</code>（合同审核状态）、<code>reviewComment</code>（审核备注）、<code>count</code>、<code>fromUser</code>；财务通过→仓库的文本卡片另传
            <span v-pre><code>{{shipConfirmUrl}}</code></span>（卡片应指向的确认页链接）；<code>shipUrl</code> 与前者同源兼容占位。执行发货仅为确认页内 POST <code>/api/public/wecom-order-ship</code>。自写接口可自行传其它变量名。
          </div>
        </el-form-item>

        <template v-if="templateForm.msgType === 'textcard'">
          <el-divider content-position="left">卡片专用字段</el-divider>
          <el-form-item>
            <template #label>
              <span>卡片标题</span>
              <el-tooltip content="消息最上面一行大字，可点右侧按钮把变量插进正文或标题" placement="top">
                <el-icon class="label-help"><QuestionFilled /></el-icon>
              </el-tooltip>
            </template>
            <div class="var-chips-inline">
              <span class="var-mini-label">插入到标题：</span>
              <el-button
                v-for="v in templateVariableList"
                :key="'t-' + v.key"
                link
                type="primary"
                size="small"
                @click="insertVariableToField('titleTemplate', v.key)"
              >
                {{ v.key }}
              </el-button>
            </div>
            <el-input v-model="templateForm.titleTemplate" placeholder="例：有新的订单待您审核" />
          </el-form-item>
          <el-form-item label="链接地址">
            <div class="var-chips-inline">
              <span class="var-mini-label">插入到链接：</span>
              <el-button
                v-for="v in templateVariableList"
                :key="'u-' + v.key"
                link
                type="primary"
                size="small"
                @click="insertVariableToField('urlTemplate', v.key)"
              >
                {{ v.key }}
              </el-button>
            </div>
            <el-input
              v-model="templateForm.urlTemplate"
              placeholder="必填。合同审批模板请填 {{reviewUrl}}（服务器须配置 PUBLIC_BASE_URL + JWT_SECRET）。仓库发货等填对应链接变量。"
            />
          </el-form-item>
          <el-form-item label="按钮文字">
            <el-input v-model="templateForm.btntxt" maxlength="16" placeholder="卡片上按钮文案，默认「详情」" />
          </el-form-item>
        </template>

        <el-divider content-position="left">{{ bodyFieldSectionTitle }}</el-divider>
        <el-form-item :label="bodyFieldLabel" required>
          <el-input
            v-model="templateForm.bodyTemplate"
            type="textarea"
            :rows="templateForm.msgType === 'textcard' ? 8 : 7"
            :placeholder="bodyPlaceholder"
          />
        </el-form-item>

        <el-form-item v-if="templateFormHasContent" label="预览（示意）">
          <el-card shadow="never" class="preview-card">
            <template v-if="templateForm.msgType === 'textcard'">
              <div class="preview-card-title">{{ templatePreview.title || '（未填标题）' }}</div>
              <div class="preview-card-body"><pre class="preview-inner">{{ templatePreview.body }}</pre></div>
              <div class="preview-card-btn">{{ templateForm.btntxt || '详情' }}</div>
            </template>
            <template v-else-if="templateForm.msgType === 'markdown'">
              <pre class="preview-markdown">{{ templatePreview.body }}</pre>
            </template>
            <template v-else>
              <pre class="preview-plain">{{ templatePreview.body }}</pre>
            </template>
            <div class="preview-foot">以上为示例数据替换占位符后的效果，实际以企业微信客户端为准。</div>
          </el-card>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDlg = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="templateSaving" @click="saveTemplate" icon=Check>保存模板</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="snippetVisible" title="HTTP 调用示例（发送消息）" size="50%" destroy-on-close>
      <p class="drawer-tip">使用员工登录后获得的 JWT，POST <code>/api/wecom/send</code>。勿把 Secret 写在小程序或前端公开代码中。</p>
      <el-tabs v-model="snippetTab">
        <el-tab-pane label="curl" name="curl">
          <pre class="code-box">{{ snippet.curl }}</pre>
          <el-button size="small" @click="copyText(snippet.curl)">复制</el-button>
        </el-tab-pane>
        <el-tab-pane label="Node (fetch)" name="node">
          <pre class="code-box">{{ snippet.nodeEsm }}</pre>
          <el-button size="small" @click="copyText(snippet.nodeEsm)">复制</el-button>
        </el-tab-pane>
        <el-tab-pane label="await fetch" name="fetch">
          <pre class="code-box">{{ snippet.fetchJs }}</pre>
          <el-button size="small" @click="copyText(snippet.fetchJs)">复制</el-button>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <el-dialog v-model="testDlg" title="测试发送" width="480px" destroy-on-close>
      <el-form label-width="100px">
        <el-form-item label="模板">
          <code>{{ testRow?.code }}</code>
        </el-form-item>
        <el-form-item label="通知对象">
          <el-select v-model="testRecipientId" placeholder="选择已保存的对象" style="width: 100%">
            <el-option
              v-for="r in recipients"
              :key="r.id"
              :label="`${r.nameZh} (${(r.wecomUserids || []).join(', ')})`"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="变量 JSON">
          <el-input v-model="testVariablesJson" type="textarea" :rows="5" placeholder='{"title":"测","detail":"试"}' />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="testDlg = false" icon=Close>取消</el-button>
        <el-button type="primary" :loading="testSending" @click="submitTestSend" icon=Promotion>发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  wecomMeta,
  getWecomConfig,
  updateWecomConfig,
  listWecomRecipients,
  createWecomRecipient,
  updateWecomRecipient,
  deleteWecomRecipient,
  listWecomTemplates,
  createWecomTemplate,
  updateWecomTemplate,
  deleteWecomTemplate,
  getWecomTemplateSnippet,
  sendWecomNotification,
  listWecomNotifyJobs,
  retryWecomNotifyJob
} from '../api';

function parseUserIdsText(text) {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split(/[\n,|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

const TEMPLATE_CODE_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

/** Derives API template code from display name; falls back to tpl_<base36 time> if no Latin slug. */
function slugifyDisplayNameToCodeBase(nameZh) {
  let s = String(nameZh || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  if (!s) return '';
  if (/^[0-9]/.test(s)) s = 'n_' + s;
  if (!/^[a-zA-Z]/.test(s)) s = 'tpl_' + s;
  if (s.length > 64) s = s.slice(0, 64).replace(/[_-]+$/, '');
  return TEMPLATE_CODE_RE.test(s) ? s : '';
}

function generateUniqueTemplateCode(nameZh, existingCodeList) {
  const taken = new Set((existingCodeList || []).map((c) => String(c || '').toLowerCase()));
  let base = slugifyDisplayNameToCodeBase(nameZh);
  if (!base) {
    base = 'tpl_' + Date.now().toString(36);
  }
  let code = base;
  let i = 2;
  while (taken.has(code.toLowerCase())) {
    const suf = '_' + i;
    const cut = Math.max(1, 64 - suf.length);
    code = base.slice(0, cut) + suf;
    i += 1;
    if (i > 500) {
      code = 'tpl_' + Date.now().toString(36) + '_' + i;
      break;
    }
  }
  return code;
}

export default {
  name: 'WecomNotifications',
  data() {
    return {
      activeTab: 'cfg',
      metaHint: '',
      metaApiBase: '',
      templateVariableSchemas: {},
      secretEncryptionEnabled: false,
      callbackBaseOverride: '',
      encodingAesKeyConfigured: false,
      clearEncodingAesKeyOnSave: false,
      receiveTokenConfigured: false,
      clearReceiveTokenOnSave: false,
      cfgLoaded: false,
      secretConfigured: false,
      cfgSaving: false,
      cfgForm: {
        corpId: '',
        agentId: 0,
        corpSecret: '',
        remark: '',
        receiveToken: '',
        encodingAesKeyNew: ''
      },
      recipients: [],
      templates: [],
      recipientDlg: false,
      recipientEditId: null,
      recipientSaving: false,
      recipientForm: { nameZh: '', userIdsText: '', sortOrder: 0 },
      templateDlg: false,
      templateEditId: null,
      templateSaving: false,
      templateCodeManual: false,
      templateCodeCatalog: [],
      templateForm: {
        code: '',
        nameZh: '',
        msgType: 'text',
        titleTemplate: '',
        bodyTemplate: '',
        urlTemplate: '',
        btntxt: '详情'
      },
      snippetVisible: false,
      snippetTab: 'curl',
      snippet: { curl: '', nodeEsm: '', fetchJs: '' },
      testDlg: false,
      testRow: null,
      testRecipientId: null,
      testVariablesJson: '{\n  "title": "测试标题",\n  "detail": "测试内容"\n}',
      testSending: false,
      jobs: [],
      jobsTotal: 0,
      jobsPage: 1,
      jobsPageSize: 20,
      jobsLoading: false,
      jobFilterStatus: '',
      jobFilterTemplateCode: '',
      jobFilterBizType: '',
      jobFilterBizId: '',
      templateVariableList: [
        { key: 'detail', label: '长摘要' },
        { key: 'orderNo', label: '订单号' },
        { key: 'customerName', label: '客户名称' },
        { key: 'contractReviewStatus', label: '合同审核状态' },
        { key: 'reviewComment', label: '审核备注' },
        { key: 'count', label: '数量' },
        { key: 'fromUser', label: '操作人' },
        { key: 'contractNo', label: '合同编号' },
        { key: 'reviewUrl', label: '合同审批页链接(文本卡片 url)' },
        { key: 'notificationTitle', label: '卡片标题(合同审批)' },
        { key: 'shipConfirmUrl', label: '发货确认页链接' },
        { key: 'shipUrl', label: '发货兼容占位(同确认页)' },
        { key: 'title', label: '短标题' }
      ]
    };
  },
  async mounted() {
    await this.loadAll();
  },
  computed: {
    displayCallbackUrl() {
      const b = String(this.callbackBaseOverride || this.metaApiBase || '')
        .trim()
        .replace(/\/$/, '');
      return b ? `${b}/api/wecom/callback` : '';
    },
    displayProbeUrl() {
      const b = String(this.callbackBaseOverride || this.metaApiBase || '')
        .trim()
        .replace(/\/$/, '');
      return b ? `${b}/api/wecom/callback/probe` : '';
    },
    bodyFieldSectionTitle() {
      const m = {
        text: '正文内容',
        markdown: '正文内容',
        textcard: '卡片摘要（灰色区域）'
      };
      return m[this.templateForm.msgType] || '正文内容';
    },
    bodyFieldLabel() {
      const m = {
        text: '正文',
        markdown: '正文',
        textcard: '摘要正文'
      };
      return m[this.templateForm.msgType] || '正文';
    },
    bodyPlaceholder() {
      const m = {
        text: '将出现在企业微信里的一段话，可直接写说明并插入 {{detail}} 等变量。',
        markdown: '支持 Markdown，如 ## 标题、**加粗**，并可插入变量。',
        textcard:
          '卡片中间灰色小字区域，可多行；若需 HTML 标签请与企业微信文档一致（预览区为纯文本示意）。'
      };
      return m[this.templateForm.msgType] || '';
    },
    templateFormHasContent() {
      const b = (this.templateForm.bodyTemplate || '').trim();
      const t = (this.templateForm.titleTemplate || '').trim();
      if (this.templateForm.msgType === 'textcard') return !!(b || t);
      return !!b;
    },
    templatePreview() {
      const sample = {
        detail: '【示例】订单 O-20260404-001 已提交财务审核，请及时处理。',
        orderNo: 'O-20260404-001',
        customerName: '杭州某某医疗科技有限公司',
        contractReviewStatus: '已驳回',
        reviewComment: '条款第 3 条金额请与订单一致后再提交。',
        count: '1',
        fromUser: '李四',
        shipConfirmUrl: 'https://你的域名/api/public/wecom-order-ship-confirm?t=示例',
        shipUrl: 'https://你的域名/api/public/wecom-order-ship-confirm?t=示例',
        title: '待审核通知'
      };
      const apply = (s) => {
        if (s == null || s === '') return '';
        return String(s).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) =>
          Object.prototype.hasOwnProperty.call(sample, k) ? sample[k] : `{{${k}}}`
        );
      };
      return {
        title: apply(this.templateForm.titleTemplate),
        body: apply(this.templateForm.bodyTemplate),
        url: apply(this.templateForm.urlTemplate)
      };
    },
    systemTemplateSchemaHint() {
      const code = (this.templateForm.code || '').trim();
      const sch = this.templateVariableSchemas[code];
      if (!sch) return '';
      const allowed = (sch.allowed || []).join('、');
      const rb = (sch.requiredInBody || []).join('、');
      const ru = (sch.requiredInUrl || []).join('、');
      let s = `系统模板「${code}」：允许变量 ${allowed}；正文须含 {{${rb}}}`;
      if (ru && this.templateForm.msgType === 'textcard') {
        s += `；链接须含 {{${ru}}}`;
      }
      return s;
    }
  },
  watch: {
    activeTab(val) {
      if (val === 'jobs') this.loadJobs();
    },
    'templateForm.nameZh'() {
      if (this.templateEditId) return;
      if (this.templateCodeManual) return;
      const name = (this.templateForm.nameZh || '').trim();
      if (!name) {
        this.templateForm.code = '';
        return;
      }
      const codes = this.templates.map((t) => t.code);
      this.templateForm.code = generateUniqueTemplateCode(name, codes);
    }
  },
  methods: {
    async loadAll() {
      try {
        const meta = await wecomMeta();
        this.metaHint = [meta?.receiveHint, meta?.placeholderHint].filter(Boolean).join('\n');
        this.metaApiBase = meta?.apiBase || '';
        this.templateCodeCatalog = Array.isArray(meta?.templateCodeCatalog) ? meta.templateCodeCatalog : [];
        this.templateVariableSchemas = meta?.templateVariableSchemas && typeof meta.templateVariableSchemas === 'object'
          ? meta.templateVariableSchemas
          : {};
        this.secretEncryptionEnabled = !!meta?.secretEncryptionEnabled;
      } catch {
        this.metaHint = '';
        this.metaApiBase = '';
        this.templateCodeCatalog = [];
      }
      await this.loadConfig();
      await this.loadRecipients();
      await this.loadTemplates();
    },
    async loadConfig() {
      const c = await getWecomConfig();
      this.cfgForm.corpId = c.corpId || '';
      this.cfgForm.agentId = c.agentId != null ? Number(c.agentId) : 0;
      this.cfgForm.remark = c.remark || '';
      this.cfgForm.corpSecret = '';
      this.cfgForm.receiveToken = '';
      this.receiveTokenConfigured = !!c.receiveTokenConfigured;
      this.clearReceiveTokenOnSave = false;
      this.cfgForm.encodingAesKeyNew = '';
      this.encodingAesKeyConfigured = !!c.encodingAesKeyConfigured;
      this.clearEncodingAesKeyOnSave = false;
      this.cfgLoaded = true;
      this.secretConfigured = !!c.secretConfigured;
    },
    markClearAesKey() {
      this.clearEncodingAesKeyOnSave = true;
      this.cfgForm.encodingAesKeyNew = '';
      ElMessage.info('下次保存将清除 EncodingAESKey');
    },
    markClearReceiveToken() {
      this.clearReceiveTokenOnSave = true;
      this.cfgForm.receiveToken = '';
      ElMessage.info('下次保存将清除回调 Token');
    },
    async saveConfig() {
      this.cfgSaving = true;
      try {
        const payload = {
          corpId: this.cfgForm.corpId || '',
          agentId: this.cfgForm.agentId != null ? Number(this.cfgForm.agentId) : 0,
          remark: this.cfgForm.remark || ''
        };
        if (this.clearReceiveTokenOnSave) {
          payload.clearReceiveToken = true;
        } else if ((this.cfgForm.receiveToken || '').trim()) {
          payload.receiveToken = (this.cfgForm.receiveToken || '').trim();
        }
        if (this.clearEncodingAesKeyOnSave) {
          payload.encodingAesKey = '';
        } else if (this.cfgForm.encodingAesKeyNew && String(this.cfgForm.encodingAesKeyNew).trim().length === 43) {
          payload.encodingAesKey = String(this.cfgForm.encodingAesKeyNew).trim();
        }
        if (this.cfgForm.corpSecret && String(this.cfgForm.corpSecret).trim()) {
          payload.corpSecret = this.cfgForm.corpSecret.trim();
        } else if (!this.secretConfigured) {
          ElMessage.warning('请填写应用 Secret');
          return;
        }
        await updateWecomConfig(payload);
        ElMessage.success('已保存');
        this.cfgForm.corpSecret = '';
        this.clearEncodingAesKeyOnSave = false;
        this.clearReceiveTokenOnSave = false;
        await this.loadConfig();
      } catch (e) {
        ElMessage.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.cfgSaving = false;
      }
    },
    async loadRecipients() {
      const { recipients } = await listWecomRecipients();
      this.recipients = recipients || [];
    },
    openRecipientDialog(row) {
      if (row) {
        this.recipientEditId = row.id;
        this.recipientForm = {
          nameZh: row.nameZh,
          userIdsText: (row.wecomUserids || []).join('\n'),
          sortOrder: row.sortOrder != null ? Number(row.sortOrder) : 0
        };
      } else {
        this.recipientEditId = null;
        this.recipientForm = { nameZh: '', userIdsText: '', sortOrder: 0 };
      }
      this.recipientDlg = true;
    },
    async saveRecipient() {
      const wecomUserids = parseUserIdsText(this.recipientForm.userIdsText);
      if (!this.recipientForm.nameZh?.trim()) {
        ElMessage.warning('请填写名称');
        return;
      }
      if (!wecomUserids.length) {
        ElMessage.warning('请填写至少一个成员 UserID');
        return;
      }
      this.recipientSaving = true;
      try {
        const payload = {
          nameZh: this.recipientForm.nameZh.trim(),
          wecomUserids,
          sortOrder: this.recipientForm.sortOrder != null ? Number(this.recipientForm.sortOrder) : 0
        };
        if (this.recipientEditId) {
          await updateWecomRecipient(this.recipientEditId, payload);
        } else {
          await createWecomRecipient(payload);
        }
        ElMessage.success('已保存');
        this.recipientDlg = false;
        await this.loadRecipients();
      } catch (e) {
        ElMessage.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.recipientSaving = false;
      }
    },
    async removeRecipient(row) {
      try {
        await ElMessageBox.confirm(`删除通知对象「${row.nameZh}」？`, '确认');
        await deleteWecomRecipient(row.id);
        await this.loadRecipients();
      } catch (e) {
        if (e !== 'cancel') ElMessage.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    async loadTemplates() {
      const { templates } = await listWecomTemplates();
      this.templates = templates || [];
    },
    resetTemplateForm() {
      this.templateForm = {
        code: '',
        nameZh: '',
        msgType: 'text',
        titleTemplate: '',
        bodyTemplate: '',
        urlTemplate: '',
        btntxt: '详情'
      };
      this.templateCodeManual = false;
      this.templateEditId = null;
    },
    openTemplateDialog(row) {
      if (row) {
        this.templateEditId = row.id;
        this.templateCodeManual = true;
        this.templateForm = {
          code: row.code,
          nameZh: row.nameZh,
          msgType: row.msgType || 'text',
          titleTemplate: row.titleTemplate || '',
          bodyTemplate: row.bodyTemplate || '',
          urlTemplate: row.urlTemplate || '',
          btntxt: row.btntxt || '详情'
        };
      } else {
        this.resetTemplateForm();
      }
      this.templateDlg = true;
    },
    onTemplateCodeManualInput() {
      if (this.templateEditId) return;
      this.templateCodeManual = true;
    },
    generateTemplateCode() {
      const name = (this.templateForm.nameZh || '').trim();
      if (!name) {
        ElMessage.warning('请先填写显示名称');
        return;
      }
      const codes = this.templates.map((t) => t.code);
      this.templateForm.code = generateUniqueTemplateCode(name, codes);
      this.templateCodeManual = false;
      ElMessage.success('已生成模板代码');
    },
    async saveTemplate() {
      if (!this.templateEditId) {
        if (!this.templateForm.code?.trim()) {
          ElMessage.warning('请填写模板代码或点击「自动生成」');
          return;
        }
        if (!TEMPLATE_CODE_RE.test(this.templateForm.code.trim())) {
          ElMessage.warning('模板代码格式不正确：需字母开头，仅可含字母/数字/_/-，长度不超过 64');
          return;
        }
      }
      if (!this.templateForm.nameZh?.trim() || !this.templateForm.bodyTemplate?.trim()) {
        ElMessage.warning('请填写名称与正文模板');
        return;
      }
      if (this.templateForm.msgType === 'textcard' && !String(this.templateForm.urlTemplate || '').trim()) {
        ElMessage.warning(
          '文本卡片必须填写「链接地址」，否则企业微信会报 41010（missing url）。可填管理后台订单页等 HTTPS 链接，并用 {{orderNo}} 等变量拼接。'
        );
        return;
      }
      this.templateSaving = true;
      try {
        if (this.templateEditId) {
          await updateWecomTemplate(this.templateEditId, {
            nameZh: this.templateForm.nameZh.trim(),
            msgType: this.templateForm.msgType,
            titleTemplate: this.templateForm.titleTemplate || null,
            bodyTemplate: this.templateForm.bodyTemplate.trim(),
            urlTemplate: this.templateForm.urlTemplate || null,
            btntxt: this.templateForm.btntxt || '详情'
          });
        } else {
          await createWecomTemplate({
            code: this.templateForm.code.trim(),
            nameZh: this.templateForm.nameZh.trim(),
            msgType: this.templateForm.msgType,
            titleTemplate: this.templateForm.titleTemplate || null,
            bodyTemplate: this.templateForm.bodyTemplate.trim(),
            urlTemplate: this.templateForm.urlTemplate || null,
            btntxt: this.templateForm.btntxt || '详情'
          });
        }
        ElMessage.success('已保存');
        this.templateDlg = false;
        await this.loadTemplates();
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'DUPLICATE_CODE') ElMessage.error('模板代码已存在');
        else if (err === 'TEXTCARD_REQUIRES_URL') {
          ElMessage.error(
            e?.response?.data?.message ||
              '文本卡片必须填写链接地址（企业微信 41010：missing url）'
          );
        } else if (
          err === 'WECOM_TEMPLATE_MISSING_VARIABLE' ||
          err === 'WECOM_TEMPLATE_UNKNOWN_VARIABLE' ||
          err === 'WECOM_TEMPLATE_MISSING_URL_VARIABLE'
        ) {
          ElMessage.error(e?.response?.data?.message || '模板变量不符合系统要求');
        } else ElMessage.error(this.$apiUserMsg(e, '保存失败'));
      } finally {
        this.templateSaving = false;
      }
    },
    async removeTemplate(row) {
      try {
        await ElMessageBox.confirm(`删除模板「${row.code}」？`, '确认');
        await deleteWecomTemplate(row.id);
        await this.loadTemplates();
      } catch (e) {
        if (e !== 'cancel') ElMessage.error(this.$apiUserMsg(e, '删除失败'));
      }
    },
    async openSnippet(row) {
      try {
        const s = await getWecomTemplateSnippet(row.code);
        this.snippet = { curl: s.curl || '', nodeEsm: s.nodeEsm || '', fetchJs: s.fetchJs || '' };
        this.snippetTab = 'curl';
        this.snippetVisible = true;
      } catch (e) {
        ElMessage.error(this.$apiUserMsg(e, '加载失败'));
      }
    },
    copyText(t) {
      navigator.clipboard.writeText(t).then(
        () => ElMessage.success('已复制'),
        () => ElMessage.error('复制失败')
      );
    },
    openTestSend(row) {
      this.testRow = row;
      this.testRecipientId = this.recipients[0]?.id ?? null;
      if (row && row.msgType === 'textcard') {
        this.testVariablesJson = JSON.stringify(
          {
            detail: '【测试】这是一条卡片摘要，真实环境由系统生成较短文案。',
            notificationTitle: '合同待审核',
            contractNo: 'TEST-CONTRACT-001',
            customerName: '测试客户',
            reviewUrl: 'https://example.com/api/public/wecom-contract-review?t=demo',
            fromUser: 'test'
          },
          null,
          2
        );
      } else {
        this.testVariablesJson = '{\n  "title": "测试标题",\n  "detail": "测试内容"\n}';
      }
      this.testDlg = true;
    },
    formatJobTime(t) {
      if (t == null || t === '') return '—';
      return String(t).replace('T', ' ').slice(0, 23);
    },
    async loadJobs() {
      this.jobsLoading = true;
      try {
        const params = { page: this.jobsPage, pageSize: this.jobsPageSize };
        if (this.jobFilterStatus) params.status = this.jobFilterStatus;
        const tc = String(this.jobFilterTemplateCode || '').trim();
        if (tc) params.templateCode = tc;
        const bt = String(this.jobFilterBizType || '').trim();
        if (bt) params.bizType = bt;
        const bid = String(this.jobFilterBizId || '').trim();
        if (bid) params.bizId = bid;
        const d = await listWecomNotifyJobs(params);
        this.jobs = (d.items || []).map((x) => ({ ...x, _retrying: false }));
        this.jobsTotal = Number(d.total) || 0;
      } catch (e) {
        ElMessage.error(this.$apiUserMsg(e, '加载发送记录失败'));
        this.jobs = [];
        this.jobsTotal = 0;
      } finally {
        this.jobsLoading = false;
      }
    },
    async retryJob(row) {
      row._retrying = true;
      try {
        await retryWecomNotifyJob(row.id);
        ElMessage.success('已重新入队');
        await this.loadJobs();
      } catch (e) {
        ElMessage.error(this.$apiUserMsg(e, '重试失败'));
      } finally {
        row._retrying = false;
      }
    },
    async submitTestSend() {
      let variables = {};
      try {
        variables = JSON.parse(this.testVariablesJson || '{}');
      } catch {
        ElMessage.warning('变量不是合法 JSON');
        return;
      }
      if (!this.testRecipientId) {
        ElMessage.warning('请选择通知对象');
        return;
      }
      this.testSending = true;
      try {
        await sendWecomNotification({
          templateCode: this.testRow.code,
          variables,
          recipientId: this.testRecipientId
        });
        ElMessage.success('已发送');
        this.testDlg = false;
      } catch (e) {
        ElMessage.error(this.$apiUserMsg(e, '发送失败'));
      } finally {
        this.testSending = false;
      }
    },
    msgTypeLabel(t) {
      const m = { text: '纯文本', markdown: 'Markdown', textcard: '文本卡片' };
      return m[t] || t || '—';
    },
    insertVariableToField(field, key) {
      const token = `{{${key}}}`;
      const cur = this.templateForm[field] ?? '';
      this.templateForm[field] = String(cur) + token;
    },
    varChipButtonText(v) {
      return `${v.label} → {{${v.key}}}`;
    }
  }
};
</script>

<style scoped>
.wecom-page {
  padding: 8px 0 24px;
}
.mb-3 {
  margin-bottom: 12px;
}
.form-block {
  max-width: 560px;
}
.toolbar {
  margin-bottom: 12px;
}
.jobs-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}
.jobs-pagination {
  margin-top: 16px;
  justify-content: flex-end;
  display: flex;
}
.text-muted {
  color: #94a3b8;
  font-size: 12px;
}
.tpl-two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}
.catalog-card,
.templates-card {
  min-width: 0;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 12px;
}
.w-full-num {
  width: 100%;
}
.w-full-num :deep(.el-input__wrapper) {
  width: 100%;
}
.drawer-tip {
  color: #64748b;
  font-size: 13px;
  margin-bottom: 16px;
  line-height: 1.5;
}
.callback-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.callback-row .el-input {
  flex: 1;
}
.field-tip {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
  margin-top: 6px;
}
.text-ok {
  color: #059669;
  margin-right: 8px;
}
.code-box {
  background: #0f172a;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  max-height: 360px;
  white-space: pre-wrap;
  word-break: break-all;
}
.tab-lead {
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 12px;
  max-width: 720px;
}
.template-intro {
  margin-bottom: 14px;
}
.template-intro-body {
  font-size: 13px;
  line-height: 1.55;
  color: #475569;
}
.template-intro-body code {
  font-size: 12px;
  padding: 1px 5px;
  background: #f1f5f9;
  border-radius: 4px;
}
.template-form {
  max-width: 100%;
}
.code-generate-row {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.code-generate-row .el-input {
  flex: 1;
  min-width: 0;
}
.msg-type-radios {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.msg-type-radios :deep(.el-radio) {
  align-items: flex-start;
  height: auto;
  margin-right: 0;
  padding: 10px 12px;
}
.msg-type-radios :deep(.el-radio__label) {
  white-space: normal;
  line-height: 1.45;
}
.msg-type-title {
  display: block;
  font-weight: 600;
  color: #0f172a;
}
.msg-type-desc {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}
.var-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.var-chips-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.var-mini-label {
  font-size: 12px;
  color: #64748b;
}
.label-help {
  margin-left: 4px;
  vertical-align: -2px;
  color: #94a3b8;
  cursor: help;
}
.preview-card {
  width: 100%;
  max-width: 400px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}
.preview-card :deep(.el-card__body) {
  padding: 12px 14px;
}
.preview-card-title {
  font-weight: 600;
  font-size: 15px;
  color: #0f172a;
  margin-bottom: 8px;
}
.preview-card-body {
  background: #f1f5f9;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
  max-height: 200px;
  overflow: auto;
}
.preview-inner {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
}
.preview-card-btn {
  display: inline-block;
  font-size: 13px;
  color: #2563eb;
  padding: 4px 0;
}
.preview-plain,
.preview-markdown {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
}
.preview-foot {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f1f5f9;
  font-size: 12px;
  color: #94a3b8;
}
@media (max-width: 1200px) {
  .tpl-two-cols {
    grid-template-columns: 1fr;
  }
}
</style>
