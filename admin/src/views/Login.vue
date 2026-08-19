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
              <span>订单与报告</span>
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
        <p class="copyright">© {{ copyrightYear }} Wuyuan Digital Management Platform</p>
      </div>
    </div>

    <div class="login-right">
      <div class="mobile-brand">
        <h1 class="mobile-brand-title">物源数智管控平台</h1>
        <p class="mobile-brand-sub">Wuyuan Digital Management Platform</p>
      </div>
      <div class="login-card">
        <div class="card-header">
          <h2 class="card-title">{{ cardTitle }}</h2>
          <p class="card-desc">{{ cardDesc }}</p>
        </div>

        <el-alert
          v-if="formError"
          class="login-alert"
          :title="formError"
          type="error"
          show-icon
          :closable="true"
          @close="formError = ''"
        />

        <transition name="login-step" mode="out-in">
          <el-form
            v-if="step === 'password'"
            key="password"
            class="login-form"
            :model="form"
            @submit.prevent="onLogin"
          >
            <el-form-item>
              <el-input
                ref="usernameInput"
                v-model="form.username"
                class="login-field"
                size="large"
                autocomplete="username"
                placeholder="用户编号 / 姓名 / 手机号"
                clearable
                @input="formError = ''"
              >
                <template #prefix>
                  <el-icon class="login-field__icon"><User /></el-icon>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item>
              <el-input
                ref="passwordInput"
                v-model="form.password"
                class="login-field"
                size="large"
                type="password"
                autocomplete="current-password"
                show-password
                placeholder="请输入密码"
                clearable
                @input="formError = ''"
                @keyup.enter="onLogin"
              >
                <template #prefix>
                  <el-icon class="login-field__icon"><Lock /></el-icon>
                </template>
              </el-input>
            </el-form-item>
            <el-form-item class="login-form__remember">
              <el-checkbox v-model="rememberUsername">记住账号</el-checkbox>
            </el-form-item>
            <el-form-item class="login-form__actions">
              <el-button
                type="primary"
                class="login-btn"
                :loading="loading"
                native-type="submit"
              >
                登 录
              </el-button>
            </el-form-item>
          </el-form>

          <div v-else-if="step === 'totp_login'" key="totp_login" class="totp-block">
            <div class="totp-header">
              <el-icon class="totp-icon"><Key /></el-icon>
              <p class="totp-desc totp-desc--compact">打开 Google Authenticator、微软验证器等 App，输入当前 6 位动态码</p>
            </div>
            <el-input
              ref="totpInput"
              v-model="totpCode"
              maxlength="6"
              size="large"
              inputmode="numeric"
              autocomplete="one-time-code"
              placeholder="000000"
              clearable
              class="login-field totp-input"
              aria-label="6 位动态验证码"
              @keyup.enter="onTotpLoginSubmit"
            />
            <el-button
              type="primary"
              class="login-btn totp-btn"
              :loading="loading"
              :disabled="totpCode.length !== 6"
              @click="onTotpLoginSubmit"
            >
              验证并登录
            </el-button>
            <el-button text type="primary" class="back-link" :icon="Back" @click="backToPassword">
              返回重新输入密码
            </el-button>
          </div>

          <div v-else key="totp_setup" class="totp-block">
            <div class="totp-header">
              <el-icon class="totp-icon"><CircleCheckFilled /></el-icon>
              <p class="totp-desc totp-desc--compact">您的岗位需开启双因素认证。请用验证器扫描二维码，完成后输入 App 中的 6 位码</p>
            </div>
            <div v-if="setupLoading" v-loading="true" class="setup-loading" element-loading-text="正在生成绑定二维码…" />
            <template v-else>
              <div v-if="qrDataUrl" class="qr-wrap">
                <img :src="qrDataUrl" alt="双因素认证绑定二维码" class="qr-img" />
              </div>
              <div v-if="totpSecret" class="totp-secret">
                <p class="totp-secret__label">无法扫码？复制密钥到验证器中手动添加</p>
                <div class="totp-secret__row">
                  <code class="totp-secret__code">{{ totpSecret }}</code>
                  <el-button size="small" type="primary" plain @click="copyTotpSecret">
                    {{ secretCopied ? '已复制' : '复制密钥' }}
                  </el-button>
                </div>
              </div>
              <el-input
                ref="totpInput"
                v-model="totpCode"
                maxlength="6"
                size="large"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="输入 6 位码完成绑定"
                clearable
                class="login-field totp-input"
                aria-label="6 位动态验证码"
                @keyup.enter="onTotpActivateSubmit"
              />
              <el-button
                type="primary"
                class="login-btn totp-btn"
                :loading="loading"
                :disabled="totpCode.length !== 6"
                :icon="Check"
                @click="onTotpActivateSubmit"
              >
                确认绑定并登录
              </el-button>
              <el-button text type="primary" class="back-link" :icon="Back" @click="backToPassword">
                返回重新输入密码
              </el-button>
            </template>
          </div>
        </transition>

        <p v-if="step === 'password' && showDevHint" class="login-hint">
          开发环境测试账号：admin / admin123
        </p>
      </div>
      <p class="mobile-copyright">© {{ copyrightYear }} Wuyuan Digital Management Platform</p>
    </div>

    <Teleport to="body">
      <transition name="login-redirect">
        <div
          v-if="redirecting"
          class="login-redirect-overlay"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div class="login-redirect-panel">
            <div class="login-redirect-spinner" aria-hidden="true">
              <l-helix size="140" speed="1.75" color="#60a5fa"></l-helix>
            </div>
            <BlurText
              :key="`title-${redirectPhase}-${redirectTitle}`"
              :text="redirectTitle"
              animate-by="letters"
              direction="top"
              :delay="80"
              :step-duration="0.32"
              class-name="login-redirect-title"
            />
            <BlurText
              :key="`desc-${redirectPhase}-${redirectDesc}`"
              :text="redirectDesc"
              animate-by="letters"
              direction="bottom"
              :delay="55"
              :step-duration="0.28"
              class-name="login-redirect-desc"
            />
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script>
import { getMe, login, totpActivate, totpProvision, totpVerifyLogin } from '../api';
import { useAuthStore } from '../stores/auth';
import BlurText from '../components/vue-bits/BlurText.vue';
import {
  User,
  Lock,
  Key,
  CircleCheckFilled,
  Document,
  Grid,
  Back,
  Check
} from '@element-plus/icons-vue';
import 'ldrs/helix';

const LOGIN_USERNAME_KEY = 'report_login_username';
const LOGIN_REMEMBER_KEY = 'report_login_remember';

function parseTotpSecretFromOtpauth(otpauthUrl) {
  if (!otpauthUrl) return '';
  try {
    return new URL(String(otpauthUrl)).searchParams.get('secret') || '';
  } catch {
    const m = String(otpauthUrl).match(/[?&]secret=([^&]+)/i);
    return m ? decodeURIComponent(m[1]) : '';
  }
}

export default {
  name: 'Login',
  components: { User, Lock, Key, CircleCheckFilled, Document, Grid, BlurText },
  setup() {
    return { Back, Check };
  },
  data() {
    return {
      step: 'password',
      loading: false,
      setupLoading: false,
      form: { username: '', password: '' },
      rememberUsername: false,
      pendingToken: '',
      totpCode: '',
      qrDataUrl: '',
      totpSecret: '',
      secretCopied: false,
      formError: '',
      redirecting: false,
      redirectPhase: 'logging-in',
      copyrightYear: new Date().getFullYear()
    };
  },
  computed: {
    cardTitle() {
      if (this.step === 'totp_login') return '双因素验证';
      if (this.step === 'totp_setup') return '绑定验证器';
      return '欢迎登录';
    },
    cardDesc() {
      if (this.step === 'totp_login') return '为保障账号安全，请完成二次验证';
      if (this.step === 'totp_setup') return '首次登录需绑定手机验证器';
      return '请输入您的账号信息';
    },
    showDevHint() {
      return import.meta.env.DEV;
    },
    redirectTitle() {
      return this.redirectPhase === 'entering' ? '登录成功' : '正在登录';
    },
    redirectDesc() {
      return this.redirectPhase === 'entering' ? '正在进入系统…' : '请稍候…';
    }
  },
  watch: {
    step(val) {
      this.formError = '';
      this.$nextTick(() => {
        if (val === 'password') this.focusField('username');
        else this.focusField('totp');
      });
    },
    totpCode(val) {
      const digits = String(val || '').replace(/\D/g, '').slice(0, 6);
      if (digits !== val) this.totpCode = digits;
      if (this.formError) this.formError = '';
    }
  },
  mounted() {
    this.loadRememberedUsername();
    this.focusField('username');
  },
  methods: {
    focusField(which) {
      this.$nextTick(() => {
        const ref =
          which === 'username'
            ? this.$refs.usernameInput
            : which === 'password'
              ? this.$refs.passwordInput
              : this.$refs.totpInput;
        ref?.focus?.();
      });
    },
    loadRememberedUsername() {
      try {
        if (localStorage.getItem(LOGIN_REMEMBER_KEY) === '1') {
          this.rememberUsername = true;
          this.form.username = localStorage.getItem(LOGIN_USERNAME_KEY) || '';
          if (this.form.username) {
            this.$nextTick(() => this.focusField('password'));
          }
        }
      } catch {
        /* ignore */
      }
    },
    persistRememberedUsername() {
      try {
        if (this.rememberUsername) {
          localStorage.setItem(LOGIN_USERNAME_KEY, String(this.form.username || '').trim());
          localStorage.setItem(LOGIN_REMEMBER_KEY, '1');
        } else {
          localStorage.removeItem(LOGIN_USERNAME_KEY);
          localStorage.removeItem(LOGIN_REMEMBER_KEY);
        }
      } catch {
        /* ignore */
      }
    },
    setFormError(message) {
      this.formError = message || '';
    },
    async hydrateSessionByMe() {
      try {
        const d = await getMe();
        useAuthStore().applyMeResponse(d);
      } catch {
        /* ignore: login response already applied */
      }
    },
    resetTotpState() {
      this.totpCode = '';
      this.qrDataUrl = '';
      this.totpSecret = '';
      this.secretCopied = false;
    },
    backToPassword() {
      this.step = 'password';
      this.pendingToken = '';
      this.resetTotpState();
      this.formError = '';
    },
    showLoginOverlay(phase = 'logging-in') {
      this.redirectPhase = phase;
      this.redirecting = true;
      this.loading = true;
    },
    hideLoginOverlay() {
      this.redirecting = false;
      this.redirectPhase = 'logging-in';
    },
    async enterAppAfterLogin() {
      this.showLoginOverlay('entering');
      await this.$nextTick();
      // 保证全屏动画与 BlurText 有短暂可见时间，避免瞬时跳转一闪而过
      await new Promise((r) => setTimeout(r, 900));
      await this.$router.push('/dashboard');
    },
    async onLogin() {
      if (!this.form.username || !this.form.password) {
        this.setFormError('请输入用户编号/姓名/手机号和密码');
        this.focusField(!this.form.username ? 'username' : 'password');
        return;
      }
      this.formError = '';
      this.showLoginOverlay('logging-in');
      try {
        const data = await login(this.form.username, this.form.password);
        this.persistRememberedUsername();
        if (data.token) {
          useAuthStore().applyLoginResponse(data);
          this.showLoginOverlay('entering');
          await this.hydrateSessionByMe();
          await this.enterAppAfterLogin();
          return;
        }
        this.hideLoginOverlay();
        if (data.step === 'totp_login' && data.pendingToken) {
          this.pendingToken = data.pendingToken;
          this.resetTotpState();
          this.step = 'totp_login';
          return;
        }
        if (data.step === 'totp_setup' && data.pendingToken) {
          this.pendingToken = data.pendingToken;
          this.resetTotpState();
          this.step = 'totp_setup';
          await this.loadTotpProvision();
          return;
        }
        this.setFormError('登录响应异常，请稍后重试');
      } catch (e) {
        this.hideLoginOverlay();
        const err = e?.response?.data?.error;
        const st = e?.response?.status;
        if (st === 403 && err === 'ACCOUNT_LOCKED') {
          this.setFormError('账号已临时锁定，请稍后再试');
        } else if (st === 429 || err === 'TOO_MANY_REQUESTS') {
          this.setFormError('请求过于频繁，请稍后再试');
        } else {
          this.setFormError(this.$apiUserMsg(e, '登录失败，请检查账号和密码'));
        }
        this.focusField('password');
      } finally {
        if (!this.redirecting) this.loading = false;
      }
    },
    async loadTotpProvision() {
      this.setupLoading = true;
      this.qrDataUrl = '';
      this.totpSecret = '';
      try {
        const d = await totpProvision(this.pendingToken);
        this.qrDataUrl = d.qrDataUrl || '';
        this.totpSecret = parseTotpSecretFromOtpauth(d.otpauthUrl);
      } catch (e) {
        this.setFormError(this.$apiUserMsg(e, '获取绑定信息失败'));
        this.backToPassword();
      } finally {
        this.setupLoading = false;
      }
    },
    async copyTotpSecret() {
      if (!this.totpSecret) return;
      try {
        await navigator.clipboard.writeText(this.totpSecret);
        this.secretCopied = true;
        this.$message.success('密钥已复制');
        setTimeout(() => {
          this.secretCopied = false;
        }, 2000);
      } catch {
        this.$message.warning('复制失败，请手动选择密钥文本');
      }
    },
    async onTotpLoginSubmit() {
      if (!this.pendingToken) return;
      const code = String(this.totpCode || '').replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) {
        this.setFormError('请输入 6 位数字动态码');
        this.focusField('totp');
        return;
      }
      this.formError = '';
      this.showLoginOverlay('logging-in');
      try {
        const data = await totpVerifyLogin(this.pendingToken, code);
        useAuthStore().applyLoginResponse(data);
        this.showLoginOverlay('entering');
        await this.hydrateSessionByMe();
        await this.enterAppAfterLogin();
      } catch (e) {
        this.hideLoginOverlay();
        const err = e?.response?.data?.error;
        if (err === 'TOTP_CODE_INVALID') {
          this.setFormError('动态码错误或已过期，请重新输入');
          this.totpCode = '';
        } else {
          this.setFormError(this.$apiUserMsg(e, '验证失败，请重试'));
        }
        this.focusField('totp');
      } finally {
        if (!this.redirecting) this.loading = false;
      }
    },
    async onTotpActivateSubmit() {
      if (!this.pendingToken) return;
      const code = String(this.totpCode || '').replace(/\s/g, '');
      if (!/^\d{6}$/.test(code)) {
        this.setFormError('请输入 6 位数字动态码');
        this.focusField('totp');
        return;
      }
      this.formError = '';
      this.showLoginOverlay('logging-in');
      try {
        const data = await totpActivate(this.pendingToken, code);
        useAuthStore().applyLoginResponse(data);
        this.showLoginOverlay('entering');
        await this.hydrateSessionByMe();
        this.$message.success('双因素认证已启用');
        await this.enterAppAfterLogin();
      } catch (e) {
        this.hideLoginOverlay();
        const err = e?.response?.data?.error;
        if (err === 'TOTP_CODE_INVALID') {
          this.setFormError('动态码错误或已过期，请确认验证器时间正确后重试');
          this.totpCode = '';
        } else {
          this.setFormError(this.$apiUserMsg(e, '绑定失败，请重试'));
        }
        this.focusField('totp');
      } finally {
        if (!this.redirecting) this.loading = false;
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
  text-align: center;
}

.brand-sub {
  margin: 0;
  font-size: 18px;
  letter-spacing: 4px;
  color: #2d5a87;
  text-transform: uppercase;
  text-align: center;
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

.login-right {
  position: fixed;
  right: 200px;
  top: 50%;
  transform: translateY(-50%);
  width: min(460px, calc(100vw - 480px));
  min-width: 380px;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: saturate(180%) blur(30px);
  -webkit-backdrop-filter: saturate(180%) blur(30px);
  border-radius: 30px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 8px 40px rgba(30, 58, 95, 0.12),
    inset 0 0 0 1px rgba(255, 255, 255, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  padding: 48px 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.login-card {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  --login-control-h: 48px;
  --login-control-radius: 12px;
  --login-field-bg: rgba(255, 255, 255, 0.72);
  --login-field-border: rgba(30, 58, 95, 0.14);
  --login-field-border-hover: rgba(30, 58, 95, 0.28);
  --login-field-focus: #3b82f6;
  --el-input-height: var(--login-control-h);
  --el-component-size: var(--login-control-h);
}

/* 账号 / 密码 / 登录按钮统一高度 */
.login-card :deep(.el-input),
.login-card :deep(.el-input__wrapper),
.login-card :deep(.login-btn.el-button) {
  height: var(--login-control-h) !important;
  min-height: var(--login-control-h) !important;
  max-height: var(--login-control-h) !important;
  box-sizing: border-box;
}

.login-card :deep(.el-input__wrapper) {
  padding: 0 16px;
  border-radius: var(--login-control-radius);
  display: inline-flex;
  align-items: center;
}

.login-form :deep(.el-form-item__content) {
  min-height: var(--login-control-h);
  line-height: var(--login-control-h);
}

.card-header {
  margin-bottom: 32px;
  text-align: center;
}

.card-title {
  margin: 0 0 12px;
  font-size: 30px;
  font-weight: 700;
  color: #1e3a5f;
  letter-spacing: 2px;
}

.card-desc {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  line-height: 1.65;
}

.login-alert {
  margin-bottom: 20px;
}

.login-alert :deep(.el-alert__title) {
  font-size: 13px;
  line-height: 1.45;
}

.login-step-enter-active,
.login-step-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.login-step-enter-from,
.login-step-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.login-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.login-field :deep(.el-input__wrapper) {
  background: var(--login-field-bg);
  border: 1px solid var(--login-field-border);
  box-shadow:
    0 1px 2px rgba(30, 58, 95, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.login-field :deep(.el-input__wrapper:hover) {
  background: rgba(255, 255, 255, 0.92);
  border-color: var(--login-field-border-hover);
  box-shadow:
    0 2px 10px rgba(30, 58, 95, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.login-field :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  border-color: var(--login-field-focus);
  box-shadow:
    0 0 0 3px rgba(59, 130, 246, 0.16),
    0 4px 14px rgba(30, 58, 95, 0.08);
}

.login-field :deep(.el-input__inner) {
  color: #0f172a;
  font-weight: 500;
  font-size: 15px;
  letter-spacing: 0.01em;
  height: 100%;
  line-height: 1;
}

.login-field :deep(.el-input__inner::placeholder) {
  color: #94a3b8;
  font-weight: 400;
  letter-spacing: 0;
}

.login-field :deep(.el-input__prefix),
.login-field :deep(.el-input__suffix) {
  color: #64748b;
}

.login-field :deep(.el-input__prefix) {
  margin-right: 4px;
}

.login-field :deep(.login-field__icon) {
  font-size: 17px;
  transition: color 0.2s ease;
}

.login-field :deep(.el-input__wrapper.is-focus .login-field__icon) {
  color: var(--login-field-focus);
}

.login-field :deep(.el-input__clear),
.login-field :deep(.el-input__password) {
  font-size: 15px;
  color: #94a3b8;
}

.login-field :deep(.el-input__clear:hover),
.login-field :deep(.el-input__password:hover) {
  color: #475569;
}

.login-form__remember {
  margin-top: 2px;
  margin-bottom: 8px !important;
}

.login-form__remember :deep(.el-checkbox__label) {
  font-size: 13px;
  color: #64748b;
}

.login-form__actions {
  margin-top: 20px;
  margin-bottom: 0 !important;
}

.login-btn,
.login-card :deep(.login-btn.el-button) {
  width: 100%;
  padding: 0 16px !important;
  font-size: 15px;
  font-weight: 600;
  line-height: var(--login-control-h) !important;
  border-radius: var(--login-control-radius);
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
  transition: all 0.3s ease;
}

.login-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
  transform: translateY(-1px);
}

.login-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.login-hint {
  margin: 28px 0 0;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
}

.totp-block {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.totp-header {
  text-align: center;
  margin-bottom: 4px;
}

.totp-icon {
  font-size: 44px;
  color: #3b82f6;
  margin-bottom: 12px;
}

.totp-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.7;
}

.totp-desc--compact {
  text-align: left;
}

.totp-input :deep(.el-input__inner) {
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.35em;
  font-variant-numeric: tabular-nums;
  height: 100%;
  line-height: 1;
}

.totp-input :deep(.el-input__inner::placeholder) {
  letter-spacing: 0.35em;
  font-weight: 500;
}

.totp-btn {
  margin-top: 8px;
}

.back-link {
  align-self: center;
  font-size: 13px;
  margin-top: 4px;
}

.qr-wrap {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.qr-img {
  width: 168px;
  height: 168px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fff;
}

.setup-loading {
  min-height: 180px;
}

.totp-secret {
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px dashed rgba(59, 130, 246, 0.35);
}

.totp-secret__label {
  margin: 0 0 8px;
  font-size: 12px;
  color: #64748b;
  line-height: 1.45;
}

.totp-secret__row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.totp-secret__code {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  font-size: 12px;
  word-break: break-all;
  color: #0f172a;
}

.mobile-brand,
.mobile-copyright {
  display: none;
}

.login-redirect-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(59, 130, 246, 0.18), transparent 50%),
    radial-gradient(ellipse at 70% 80%, rgba(30, 58, 95, 0.22), transparent 45%),
    rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
}

.login-redirect-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 36px 40px;
  text-align: center;
}

.login-redirect-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 160px;
  height: 160px;
  margin-bottom: 12px;
}

.login-redirect-panel :deep(.login-redirect-title) {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #f8fafc;
}

.login-redirect-panel :deep(.login-redirect-desc) {
  margin: 0;
  font-size: 13px;
  letter-spacing: 1px;
  color: rgba(226, 232, 240, 0.85);
}

.login-redirect-enter-active,
.login-redirect-leave-active {
  transition: opacity 0.28s ease;
}

.login-redirect-enter-active .login-redirect-panel,
.login-redirect-leave-active .login-redirect-panel {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.login-redirect-enter-from,
.login-redirect-leave-to {
  opacity: 0;
}

.login-redirect-enter-from .login-redirect-panel,
.login-redirect-leave-to .login-redirect-panel {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

@media (max-width: 1280px) {
  .login-right {
    right: 48px;
    width: min(420px, calc(100vw - 360px));
  }
}

@media (max-width: 1024px) {
  .login-page {
    min-height: 100dvh;
    height: auto;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: url('/bg.jpg') center center / cover no-repeat;
  }

  .login-left {
    display: none;
  }

  .login-right {
    position: relative;
    right: auto;
    top: auto;
    transform: none;
    box-sizing: border-box;
    width: 100%;
    min-width: unset;
    min-height: 100dvh;
    max-height: none;
    height: auto;
    padding: 0 max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom))
      max(20px, env(safe-area-inset-left));
    border-radius: 0;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border: none;
    box-shadow: none;
    display: grid;
    grid-template-rows: auto 1fr auto;
    align-items: center;
    justify-items: center;
    gap: 0;
    overflow: visible;
  }

  .mobile-brand {
    display: block;
    grid-row: 1;
    align-self: start;
    justify-self: center;
    width: 100%;
    padding-top: max(56px, calc(env(safe-area-inset-top) + 32px));
    text-align: center;
    flex-shrink: 0;
  }

  .mobile-brand-title {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #1e3a5f;
  }

  .mobile-brand-sub {
    margin: 0;
    font-size: 11px;
    letter-spacing: 1px;
    color: #2d5a87;
    text-transform: uppercase;
  }

  .login-card {
    grid-row: 2;
    align-self: center;
    justify-self: center;
    width: 100%;
    max-width: 420px;
    margin: 0;
    padding: 32px 28px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.5);
    box-shadow: 0 8px 32px rgba(30, 58, 95, 0.15);
  }

  .mobile-copyright {
    display: block;
    grid-row: 3;
    align-self: end;
    justify-self: center;
    width: 100%;
    margin: 0;
    padding: 16px 0 max(8px, env(safe-area-inset-bottom));
    text-align: center;
    font-size: 11px;
    color: #5a7a9a;
    flex-shrink: 0;
  }
}

@media (max-width: 480px) {
  .login-right {
    padding-left: max(16px, env(safe-area-inset-left));
    padding-right: max(16px, env(safe-area-inset-right));
  }

  .mobile-brand {
    padding-top: max(44px, calc(env(safe-area-inset-top) + 24px));
  }

  .mobile-brand-title {
    font-size: 20px;
    letter-spacing: 1px;
  }

  .login-card {
    padding: 28px 22px;
    border-radius: 16px;
  }

  .card-header {
    margin-bottom: 28px;
  }

  .card-title {
    font-size: 22px;
  }

  .card-desc {
    font-size: 13px;
  }

  .login-form :deep(.el-form-item) {
    margin-bottom: 20px;
  }

  .login-field :deep(.el-input__inner) {
    font-size: 16px;
  }

  .totp-input :deep(.el-input__inner) {
    font-size: 18px;
    letter-spacing: 0.3em;
  }

  .login-form__actions {
    margin-top: 16px;
  }

  .login-btn,
  .login-card :deep(.login-btn.el-button) {
    line-height: var(--login-control-h) !important;
    font-size: 15px;
  }

  .totp-icon {
    font-size: 40px;
  }

  .qr-img {
    width: 152px;
    height: 152px;
  }

  .totp-secret__row {
    flex-direction: column;
    align-items: stretch;
  }

  .login-hint {
    margin-top: 16px;
    font-size: 11px;
    line-height: 1.5;
  }
}
</style>
