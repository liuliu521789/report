<template>
  <div class="wrap">
    <div class="bg-card" />
    <el-card class="card">
      <div slot="header" class="title">
        <div class="title-main">质检报告系统</div>
        <div class="title-sub">员工端后台登录</div>
      </div>

      <el-form :model="form" @submit.native.prevent="onLogin">
        <el-form-item label="账号">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="onLogin" style="width: 100%; height: 40px">登录</el-button>
        </el-form-item>
      </el-form>

      <p class="login-hint">默认测试账号：admin，密码：admin123</p>
    </el-card>
  </div>
</template>

<script>
import { login } from '../api';

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
        localStorage.setItem('token', data.token);
        localStorage.removeItem('role');
        if (data.user?.accountType) localStorage.setItem('accountType', data.user.accountType);
        if (data.user?.permissions != null) {
          localStorage.setItem('permissions', JSON.stringify(data.user.permissions));
        } else {
          localStorage.removeItem('permissions');
        }
        if (data.idleTimeoutMinutes != null) {
          localStorage.setItem('idleTimeoutMinutes', String(data.idleTimeoutMinutes));
        }
        this.$router.push('/reports');
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
.wrap {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(900px 500px at 15% 20%, rgba(125, 211, 252, 0.45), transparent 60%),
    radial-gradient(900px 500px at 80% 25%, rgba(167, 139, 250, 0.35), transparent 60%),
    #f6f7fb;
  position: relative;
  overflow: hidden;
  padding: 24px;
}
.card {
  width: 460px;
  border-radius: 16px;
}
.bg-card {
  position: absolute;
  width: 560px;
  height: 560px;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.08);
  transform: rotate(8deg);
  filter: blur(0px);
}
.title-main {
  font-weight: 800;
  letter-spacing: 0.2px;
}
.title-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}
.login-hint {
  margin: 0;
  margin-top: 4px;
  text-align: center;
  font-size: 11px;
  line-height: 1.4;
  color: #94a3b8;
}
</style>

