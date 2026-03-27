<template>
  <div class="login-page">
    <aside class="hero" aria-hidden="false">
      <div class="hero-bg">
        <div class="hero-orb hero-orb--a" />
        <div class="hero-orb hero-orb--b" />
        <div class="hero-orb hero-orb--c" />
        <div class="hero-grid" />
        <div class="hero-vignette" />
      </div>
      <div class="hero-inner">
        <div class="hero-mark">
          <span class="hero-mark__glyph">QC</span>
        </div>
        <h1 class="hero-title">质检报告系统</h1>
        <p class="hero-lead">员工端后台 · 安全登录</p>
        <p class="hero-sub">检验数据集中管理，报告发布更高效。</p>
      </div>
      <p class="hero-foot">Quality · Compliance · Traceability</p>
    </aside>

    <main class="panel">
      <div class="panel-card">
        <header class="panel-head">
          <h2 class="panel-title">欢迎回来</h2>
          <p class="panel-desc">请输入您的账号与密码</p>
        </header>

        <el-form
          class="login-form"
          :model="form"
          label-position="top"
          @submit.prevent="onLogin"
        >
          <el-form-item label="账号">
            <el-input
              v-model="form.username"
              autocomplete="username"
              placeholder="用户名"
              clearable
            />
          </el-form-item>
          <el-form-item label="密码">
            <el-input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              show-password
              placeholder="密码"
              clearable
              @keyup.enter="onLogin"
            />
          </el-form-item>
          <el-form-item class="login-form__actions">
            <el-button
              type="primary"
              class="login-btn"
              :loading="loading"
              native-type="submit"
              @click="onLogin"
            >
              登录
            </el-button>
          </el-form-item>
        </el-form>

        <p class="login-hint">默认测试账号：admin，密码：Admin@123</p>
      </div>
    </main>
  </div>
</template>

<script>
import { login } from '../api';
import { useAuthStore } from '../stores/auth';

export default {
  name: 'Login',
  data() {
    return {
      loading: false,
      form: { username: '', password: '' }
    };
  },
  methods: {
    async onLogin() {
      if (!this.form.username || !this.form.password) {
        this.$message.warning('请输入账号和密码');
        return;
      }
      this.loading = true;
      try {
        const data = await login(this.form.username, this.form.password);
        useAuthStore().applyLoginResponse(data);
        this.$router.push('/dashboard');
      } catch (e) {
        const err = e?.response?.data?.error;
        const st = e?.response?.status;
        if (st === 403 && err === 'ACCOUNT_LOCKED') {
          this.$message.error('账号已临时锁定，请稍后再试');
        } else {
          this.$message.error(err || '登录失败');
        }
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
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(360px, 1.05fr);
  grid-template-rows: minmax(0, 1fr);
  background: #f4f6fb;
}

/* —— 左侧品牌区（Trae 式深色渐变 + 网格 + 光晕） —— */
.hero {
  position: relative;
  min-height: 0;
  height: 100%;
  padding: clamp(24px, 4vw, 48px);
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: rgba(255, 255, 255, 0.94);
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(155deg, #070b14 0%, #0c1222 42%, #0f172a 100%);
}

.hero-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(72px);
  opacity: 0.85;
  pointer-events: none;
}

.hero-orb--a {
  width: 420px;
  height: 420px;
  left: -12%;
  top: -18%;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.55) 0%, transparent 70%);
}

.hero-orb--b {
  width: 380px;
  height: 380px;
  right: -8%;
  bottom: -12%;
  background: radial-gradient(circle, rgba(139, 92, 246, 0.45) 0%, transparent 70%);
}

.hero-orb--c {
  width: 280px;
  height: 280px;
  left: 38%;
  top: 42%;
  background: radial-gradient(circle, rgba(34, 211, 238, 0.28) 0%, transparent 70%);
}

.hero-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 72%);
}

.hero-vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 90% 80% at 50% 100%, rgba(0, 0, 0, 0.35), transparent 55%);
  pointer-events: none;
}

.hero-inner {
  position: relative;
  z-index: 1;
  max-width: 420px;
}

.hero-mark {
  margin-bottom: 28px;
}

.hero-mark__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.04em;
  color: #e0f2fe;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04));
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.hero-title {
  margin: 0;
  font-size: clamp(26px, 3.2vw, 34px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.hero-lead {
  margin: 14px 0 0;
  font-size: 15px;
  color: rgba(226, 232, 240, 0.88);
  font-weight: 500;
}

.hero-sub {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.65;
  color: rgba(148, 163, 184, 0.95);
  max-width: 340px;
}

.hero-foot {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin: auto 0 0;
  padding-top: 20px;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.55);
}

/* —— 右侧表单 —— */
.panel {
  min-height: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(20px, 3vw, 40px);
  background: linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
  overflow-x: hidden;
  overflow-y: auto;
}

.panel-card {
  width: 100%;
  max-width: 400px;
  padding: clamp(28px, 4vw, 40px);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.8) inset,
    0 24px 64px rgba(15, 23, 42, 0.08),
    0 4px 16px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(12px);
}

.panel-head {
  margin-bottom: 28px;
}

.panel-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
}

.panel-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: #64748b;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-form-item__label) {
  padding: 0 0 8px;
  line-height: 1.3;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.login-form :deep(.el-input__wrapper) {
  min-height: 44px;
  border-radius: 12px;
  border-color: rgba(15, 23, 42, 0.1);
  background: #fafbfc;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  background: #fff;
  border-color: rgba(14, 165, 233, 0.45);
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12);
}

.login-form__actions {
  margin-bottom: 0 !important;
  margin-top: 8px;
}

.login-btn {
  width: 100%;
  height: 46px;
  font-size: 15px;
  font-weight: 600;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 52%, #4f46e5 100%);
  box-shadow: 0 10px 28px rgba(37, 99, 235, 0.35);
}

.login-btn:hover,
.login-btn:focus {
  background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 52%, #4338ca 100%);
}

.login-hint {
  margin: 20px 0 0;
  text-align: center;
  font-size: 11px;
  line-height: 1.5;
  color: #94a3b8;
}

@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .hero {
    height: auto;
    min-height: 0;
    padding: 32px 28px 24px;
  }

  .hero-foot {
    display: none;
  }

  .panel {
    align-items: flex-start;
    padding: 16px 20px 24px;
  }
  .panel-card {
    max-width: 520px;
  }
}

@media (max-width: 640px) {
  .hero {
    padding: 24px 18px 16px;
  }
  .hero-sub {
    display: none;
  }
  .panel {
    padding: 12px;
  }
  .panel-card {
    padding: 22px 16px;
    border-radius: 14px;
  }
}
</style>
