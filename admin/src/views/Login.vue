<template>
  <div class="login-page">
    <div class="login-left">
      <div class="login-left-overlay">
        <div class="brand-content">
          <div class="brand">
            <h1 class="brand-title">物源数智管控平台</h1>
            <p class="brand-sub">Wuyuan Digital Management Platform</p>
          </div>
          <div class="features">
            <div class="feature-item">
              <el-icon class="feature-icon"><Document /></el-icon>
              <span>报告管理</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-icon"><Lock /></el-icon>
              <span>安全可靠</span>
            </div>
            <div class="feature-item">
              <el-icon class="feature-icon"><Grid /></el-icon>
              <span>扫码追溯</span>
            </div>
          </div>
        </div>
        <p class="copyright">© {{ new Date().getFullYear() }} Wuyuan Digital Management Platform</p>
      </div>
    </div>

    <div class="login-right">
      <div class="login-card">
        <div class="card-header">
          <h2 class="card-title">欢迎登录</h2>
          <p class="card-desc">请输入您的账号信息</p>
        </div>

        <el-form
          v-if="step === 'password'"
          class="login-form"
          :model="form"
          @submit.prevent="onLogin"
        >
          <el-form-item>
            <el-input
              v-model="form.username"
              autocomplete="username"
              placeholder="请输入用户名"
              clearable
              size="large"
            >
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item>
            <el-input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              show-password
              placeholder="请输入密码"
              clearable
              size="large"
              @keyup.enter="onLogin"
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
            </el-input>
          </el-form-item>
          <el-form-item class="login-form__actions">
            <el-button
              type="primary"
              class="login-btn"
              :loading="loading"
              size="large"
              native-type="submit"
              @click="onLogin"
            >
              登 录
            </el-button>
          </el-form-item>
        </el-form>

        <div v-else-if="step === 'totp_login'" class="totp-block">
          <div class="totp-header">
            <el-icon class="totp-icon"><Key /></el-icon>
            <p class="totp-title">双因素验证</p>
            <p class="totp-desc">请输入验证器 App 中的 6 位动态码</p>
          </div>
          <el-input
            v-model="totpCode"
            maxlength="8"
            placeholder="请输入 6 位动态码"
            clearable
            class="totp-input"
            size="large"
            @keyup.enter="onTotpLoginSubmit"
          />
          <el-button type="primary" class="login-btn totp-btn" size="large" :loading="loading" @click="onTotpLoginSubmit">
            验证并登录
          </el-button>
          <el-button text type="primary" class="back-link" @click="backToPassword">返回重新输入密码</el-button>
        </div>

        <div v-else class="totp-block">
          <div class="totp-header">
            <el-icon class="totp-icon"><CircleCheckFilled /></el-icon>
            <p class="totp-title">绑定双因素认证</p>
            <p class="totp-desc">您的岗位强制开启 2FA，请使用验证器扫描下方二维码</p>
          </div>
          <div v-if="setupLoading" class="setup-loading">正在生成绑定二维码…</div>
          <template v-else>
            <div v-if="qrDataUrl" class="qr-wrap">
              <img :src="qrDataUrl" alt="2FA QR" class="qr-img" />
            </div>
            <p v-if="otpauthHint" class="otpauth-hint">无法扫描时，可手动输入密钥</p>
            <el-input
              v-model="totpCode"
              maxlength="8"
              placeholder="输入验证器中 6 位码以完成绑定"
              clearable
              class="totp-input"
              size="large"
              @keyup.enter="onTotpActivateSubmit"
            />
            <el-button type="primary" class="login-btn totp-btn" size="large" :loading="loading" @click="onTotpActivateSubmit">
              确认绑定并登录
            </el-button>
            <el-button text type="primary" class="back-link" @click="backToPassword">返回重新输入密码</el-button>
          </template>
        </div>

        <p v-if="step === 'password'" class="login-hint">默认测试账号：admin，密码：Admin@123</p>
      </div>
    </div>
  </div>
</template>

<script>
import { login, totpActivate, totpProvision, totpVerifyLogin } from '../api';
import { useAuthStore } from '../stores/auth';
import { User, Lock, Key, CircleCheckFilled, Document, Grid } from '@element-plus/icons-vue';

export default {
  name: 'Login',
  components: { User, Lock, Key, CircleCheckFilled, Document, Grid },
  data() {
    return {
      step: 'password',
      loading: false,
      setupLoading: false,
      form: { username: '', password: '' },
      pendingToken: '',
      totpCode: '',
      qrDataUrl: '',
      otpauthHint: ''
    };
  },
  methods: {
    backToPassword() {
      this.step = 'password';
      this.pendingToken = '';
      this.totpCode = '';
      this.qrDataUrl = '';
      this.otpauthHint = '';
    },
    async onLogin() {
      if (!this.form.username || !this.form.password) {
        this.$message.warning('请输入账号和密码');
        return;
      }
      this.loading = true;
      try {
        const data = await login(this.form.username, this.form.password);
        if (data.token) {
          useAuthStore().applyLoginResponse(data);
          this.$router.push('/dashboard');
          return;
        }
        if (data.step === 'totp_login' && data.pendingToken) {
          this.pendingToken = data.pendingToken;
          this.totpCode = '';
          this.step = 'totp_login';
          return;
        }
        if (data.step === 'totp_setup' && data.pendingToken) {
          this.pendingToken = data.pendingToken;
          this.totpCode = '';
          this.step = 'totp_setup';
          await this.loadTotpProvision();
          return;
        }
        this.$message.error('登录响应异常');
      } catch (e) {
        const err = e?.response?.data?.error;
        const st = e?.response?.status;
        if (st === 403 && err === 'ACCOUNT_LOCKED') {
          this.$message.error('账号已临时锁定，请稍后再试');
        } else {
          this.$message.error(this.$apiUserMsg(e, '登录失败'));
        }
      } finally {
        this.loading = false;
      }
    },
    async loadTotpProvision() {
      this.setupLoading = true;
      this.qrDataUrl = '';
      this.otpauthHint = '';
      try {
        const d = await totpProvision(this.pendingToken);
        this.qrDataUrl = d.qrDataUrl || '';
        this.otpauthHint = d.otpauthUrl ? '已生成绑定信息' : '';
      } catch (e) {
        this.$message.error(this.$apiUserMsg(e, '获取绑定信息失败'));
        this.backToPassword();
      } finally {
        this.setupLoading = false;
      }
    },
    async onTotpLoginSubmit() {
      if (!this.pendingToken) return;
      const code = String(this.totpCode || '').replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) {
        this.$message.warning('请输入 6 位数字动态码');
        return;
      }
      this.loading = true;
      try {
        const data = await totpVerifyLogin(this.pendingToken, code);
        useAuthStore().applyLoginResponse(data);
        this.$router.push('/dashboard');
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'TOTP_CODE_INVALID') this.$message.error('动态码错误，请重试');
        else this.$message.error(this.$apiUserMsg(e, '验证失败'));
      } finally {
        this.loading = false;
      }
    },
    async onTotpActivateSubmit() {
      if (!this.pendingToken) return;
      const code = String(this.totpCode || '').replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) {
        this.$message.warning('请输入 6 位数字动态码');
        return;
      }
      this.loading = true;
      try {
        const data = await totpActivate(this.pendingToken, code);
        useAuthStore().applyLoginResponse(data);
        this.$message.success('双因素认证已启用');
        this.$router.push('/dashboard');
      } catch (e) {
        const err = e?.response?.data?.error;
        if (err === 'TOTP_CODE_INVALID') this.$message.error('动态码错误，请重试');
        else this.$message.error(this.$apiUserMsg(e, '绑定失败'));
      } finally {
        this.loading = false;
      }
    }
  }
};
</script>

<style scoped>
.login-page {
  box-sizing: border-box;
  height: 100vh;
  min-height: 600px;
  display: flex;
  overflow: hidden;
}

/* 左侧品牌区 */
.login-left {
  flex: 1;
  background: url('/bg.jpg') center center / cover no-repeat;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-left-overlay {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 40px;
  display: flex;
  flex-direction: column;
}

.brand-content {
  position: absolute;
  left: calc((100vw - 500px) / 2);
  top: 10%;
  transform: translateX(-50%);
}

.brand {
  text-align: center;
  margin-bottom: 40px;
}

.brand-title {
  margin: 0 0 12px;
  font-size: 52px;
  font-weight: 700;
  letter-spacing: 4px;
  background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #4a7ab5 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: justify;
  text-align-last: justify;
}

.brand-sub {
  margin: 0;
  font-size: 18px;
  letter-spacing: 4px;
  color: #2d5a87;
  text-transform: uppercase;
  text-align: justify;
  text-align-last: justify;
}

.features {
  display: flex;
  gap: 40px;
  justify-content: center;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  color: #3d6a99;
  font-weight: 500;
}

.feature-icon {
  font-size: 24px;
  color: #1e3a5f;
}

.copyright {
  position: absolute;
  bottom: 50px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  font-size: 12px;
  color: #5a7a9a;
  letter-spacing: 1px;
}

/* 右侧表单区 */
.login-right {
  position: fixed;
  right: 200px;
  top: 50%;
  transform: translateY(-50%);
  height: 50vh;
  min-width: 400px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  border-radius: 30px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 
    0 8px 40px rgba(30, 58, 95, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  padding: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

.card-header {
  margin-bottom: 36px;
  text-align: center;
}

.card-title {
  margin: 0 0 8px;
  font-size: 32px;
  font-weight: 700;
  color: #1e3a5f;
  letter-spacing: 2px;
}

.card-desc {
  margin: 0;
  font-size: 16px;
  color: #2d5a87;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 24px;
}

.login-form :deep(.el-form-item__label) {
  padding: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  color: #374151;
}

.login-form :deep(.el-input__wrapper) {
  padding: 4px 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 
    inset 0 1px 3px rgba(30, 58, 95, 0.05),
    0 1px 0 rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.login-form :deep(.el-input__wrapper:hover) {
  background: rgba(255, 255, 255, 0.15);
}

.login-form :deep(.el-input__wrapper.is-focus) {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(30, 58, 95, 0.3);
  box-shadow: 
    0 4px 20px rgba(30, 58, 95, 0.1),
    inset 0 1px 3px rgba(30, 58, 95, 0.05);
}

.login-form :deep(.el-input__inner) {
  color: #1e293b;
}

.login-form :deep(.el-input__prefix) {
  color: #64748b;
}

.login-form__actions {
  margin-top: 32px;
  margin-bottom: 0 !important;
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 16px;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
  transition: all 0.3s ease;
}

.login-form__actions {
  margin-top: 32px;
  margin-bottom: 0 !important;
}

.login-btn {
  width: 100%;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
  transition: all 0.3s ease;
}

.login-btn:hover {
  background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
  transform: translateY(-1px);
}

.login-hint {
  margin: 24px 0 0;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}

/* TOTP 区块 */
.totp-block {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.totp-header {
  text-align: center;
}

.totp-icon {
  font-size: 48px;
  color: #3b82f6;
  margin-bottom: 12px;
}

.totp-title {
  margin: 0 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: #1e293b;
}

.totp-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}

.totp-input :deep(.el-input__wrapper) {
  padding: 4px 16px;
  border-radius: 10px;
  text-align: center;
  font-size: 20px;
  letter-spacing: 8px;
}

.totp-btn {
  margin-top: 4px;
}

.back-link {
  align-self: center;
  font-size: 13px;
}

.qr-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.qr-img {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
}

.setup-loading {
  text-align: center;
  color: #64748b;
  font-size: 14px;
  padding: 32px 0;
}

.otpauth-hint {
  font-size: 12px;
  color: #64748b;
  margin: 0;
  text-align: center;
}

/* 响应式 */
@media (max-width: 1024px) {
  .login-left {
    display: none;
  }
  
  .login-right {
    width: 100%;
    min-width: unset;
  }
}

@media (max-width: 480px) {
  .login-right {
    padding: 24px 20px;
  }
  
  .card-title {
    font-size: 24px;
  }
  
  .login-btn {
    height: 44px;
    font-size: 15px;
  }
}
</style>
