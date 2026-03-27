<template>
  <div class="op-guide-page">
    <el-card shadow="never" class="op-guide-card">
      <p class="intro">
        下面是各功能的简要说明。您按左侧菜单名称对照查看即可；超级管理员还能看到「账号管理」「安全日志」等菜单。
      </p>

      <el-collapse v-model="activeSections">
        <el-collapse-item title="报告管理" name="reports">
          <ul class="guide-list">
            <li>在列表中可搜索、筛选报告，查看状态。</li>
            <li>有权限时，可新建报告、打开报告填写检查项与自定义内容。</li>
            <li>作废或修改报告前请确认公司制度；重要操作会在日志中留下记录。</li>
            <li>需要批量生成二维码时，在报告相关功能中按页面提示勾选并生成。</li>
          </ul>
        </el-collapse-item>
        <el-collapse-item title="二维码管理" name="qrcodes">
          <ul class="guide-list">
            <li>用于查看已生成的二维码，并与对应报告关联。</li>
            <li>若客户扫码打不开，先确认报告是否已发布/有效，再联系技术支持排查链接。</li>
          </ul>
        </el-collapse-item>
        <el-collapse-item title="公司章管理" name="stamps">
          <ul class="guide-list">
            <li>上传公司印章图片，并设置当前启用的印章（如有「激活」或默认章设置，以页面为准）。</li>
            <li>请使用清晰、正式的印版图片，便于打印在报告上。</li>
          </ul>
        </el-collapse-item>
        <el-collapse-item title="公司信息" name="company">
          <ul class="guide-list">
            <li>维护公司名称、Logo、简介、报告标题等对外展示信息。</li>
            <li>修改后一般会在新打印或新分享的报告中生效。</li>
          </ul>
        </el-collapse-item>
        <el-collapse-item title="账号管理（仅超级管理员）" name="accounts">
          <ul class="guide-list">
            <li><strong>员工类别：</strong>例如品管、客服等，可为每类配置默认权限。</li>
            <li><strong>员工账号：</strong>新建账号、重置权限时，请按实际岗位勾选，避免多开敏感权限。</li>
            <li><strong>技术支持联系：</strong>维护技术工程师微信号，供全员在本页底部一键复制。</li>
          </ul>
        </el-collapse-item>
        <el-collapse-item title="安全日志与系统安全（仅超级管理员）" name="audit">
          <ul class="guide-list">
            <li>登录日志、操作日志用于审计，通常不可删改。</li>
            <li>错误日志供技术人员排查；系统安全里可配置密码策略、锁定与超时等。</li>
          </ul>
        </el-collapse-item>
        <el-collapse-item title="我的操作日志" name="mylogs">
          <ul class="guide-list">
            <li>非超级管理员可在此查看本人曾执行的操作记录，便于自己核对。</li>
          </ul>
        </el-collapse-item>
        <el-collapse-item title="顶部账号菜单" name="header">
          <ul class="guide-list">
            <li>点击右上角姓名区域，可「修改密码」或「退出登录」。</li>
          </ul>
        </el-collapse-item>

        <el-collapse-item title="常见问题（FAQ）" name="faq">
          <dl class="faq-list">
            <dt>忘记密码怎么办？</dt>
            <dd>请点击登录页的提示或使用「忘记密码」流程（如有）。无法自助时，由超级管理员在「员工账号」中重置，或使用本页下方方式联系技术工程师。</dd>
            <dt>为什么我看不到某个菜单？</dt>
            <dd>菜单随权限显示。若您需要某项工作权限，请让超级管理员在「员工类别」或您的账号上勾选对应权限。</dd>
            <dt>提示「没有权限」或自动跳回报告列表？</dt>
            <dd>说明当前账号无权访问该页面，需管理员调整权限。</dd>
            <dt>为什么一会儿就退出登录了？</dt>
            <dd>系统可能启用了「长时间未操作自动退出」。稍作休息后重新登录即可；若频繁断线，可由管理员在「系统安全」查看会话超时设置。</dd>
            <dt>如何联系技术工程师？</dt>
            <dd>在页面下方点击「联系技术工程师」，可复制工程师微信号，再打开微信搜索该号码添加或发消息。</dd>
            <dt>二维码扫不出来？</dt>
            <dd>确认手机网络正常；再确认报告未被作废且链接仍有效。仍不行请把二维码编号或报告信息提供给技术支持。</dd>
            <dt>打印效果不对？</dt>
            <dd>建议使用浏览器的打印预览；检查公司章、公司信息是否已正确上传，纸张与边距以公司规范为准。</dd>
          </dl>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <el-card shadow="never" class="op-guide-footer-card">
      <p class="footer-hint">
        {{
          engineerWechatId
            ? '点击按钮可复制技术工程师微信号，请打开微信，在「搜索」或「添加朋友」中粘贴或输入后发起沟通。'
            : '若问题仍未解决，可点击按钮：如已配置微信号将自动复制；未配置时请复制说明文字发给单位超级管理员，请其在「账号管理 → 技术支持联系」中维护微信号。'
        }}
      </p>
      <el-button type="primary" :loading="supportLoading" @click="copyEngineerWechat">
        <el-icon class="btn-ico"><ChatDotRound /></el-icon>
        联系技术工程师
      </el-button>
    </el-card>
  </div>
</template>

<script>
import { ChatDotRound } from '@element-plus/icons-vue';
import { getSupportContact } from '../api';

export default {
  name: 'OperationGuide',
  components: { ChatDotRound },
  data() {
    return {
      activeSections: ['reports', 'faq'],
      engineerWechatId: '',
      supportLoading: false
    };
  },
  async mounted() {
    await this.loadSupportContact();
  },
  methods: {
    async loadSupportContact() {
      this.supportLoading = true;
      try {
        const { engineerWechatId } = await getSupportContact();
        this.engineerWechatId = (engineerWechatId || '').trim();
      } catch (_) {
        this.engineerWechatId = '';
      } finally {
        this.supportLoading = false;
      }
    },
    async copyEngineerWechat() {
      if (this.supportLoading) {
        this.$message.info('正在获取联系方式，请稍候再试');
        return;
      }
      let id = (this.engineerWechatId || '').trim();
      if (!id) {
        this.supportLoading = true;
        try {
          const { engineerWechatId } = await getSupportContact();
          id = (engineerWechatId || '').trim();
          this.engineerWechatId = id;
        } catch (_) {
          this.$message.error('无法获取技术支持信息，请检查网络后重试');
          return;
        } finally {
          this.supportLoading = false;
        }
      }

      if (id) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(id);
            this.$message.success('微信号已复制，请打开微信搜索或添加该账号后沟通');
          } catch (_) {
            this.$message.warning(`请手动复制：${id}`);
          }
        } else {
          this.$message.info(`请手动复制微信号：${id}`);
        }
        return;
      }

      const text =
        '【质检报告系统】我需要技术支持，请超级管理员在后台「账号管理 → 技术支持联系」中填写技术工程师微信号，以便我们在操作指南中复制联系。';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () =>
            this.$message.success('已复制说明文字，请发给单位超级管理员；您也可自行打开微信向同事求助'),
          () => this.$message.info(text)
        );
      } else {
        this.$message.info(text);
      }
    }
  }
};
</script>

<style scoped>
.op-guide-page {
  max-width: 880px;
}

.op-guide-card {
  margin-bottom: 16px;
}

.op-guide-card :deep(.el-card__body) {
  padding-top: 12px;
}

.intro {
  margin: 0 0 16px;
  font-size: 14px;
  color: #64748b;
  line-height: 1.65;
}

.guide-list {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  color: #334155;
  line-height: 1.65;
}

.guide-list li + li {
  margin-top: 6px;
}

.faq-list {
  margin: 0;
}

.faq-list dt {
  font-weight: 600;
  color: #0f172a;
  font-size: 14px;
  margin-top: 12px;
}

.faq-list dt:first-child {
  margin-top: 0;
}

.faq-list dd {
  margin: 6px 0 0;
  padding: 0;
  font-size: 14px;
  color: #475569;
  line-height: 1.65;
}

.op-guide-footer-card :deep(.el-card__body) {
  padding: 18px 20px;
  background: #f8fafc;
  border-radius: var(--radius, 14px);
}

.footer-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: #64748b;
  line-height: 1.55;
  max-width: 640px;
}

.btn-ico {
  margin-right: 6px;
  vertical-align: middle;
}
@media (max-width: 992px) {
  .op-guide-page {
    max-width: 100%;
  }
  .op-guide-card :deep(.el-card__body),
  .op-guide-footer-card :deep(.el-card__body) {
    padding: 12px;
  }
  .intro,
  .guide-list,
  .faq-list dd {
    font-size: 13px;
    line-height: 1.6;
  }
  .faq-list dt {
    font-size: 13px;
  }
  .footer-hint {
    max-width: 100%;
  }
  .op-guide-footer-card .el-button {
    width: 100%;
  }
}
</style>
