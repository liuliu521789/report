import os from 'os';

function isLoopbackHost(host) {
  if (!host) return true;
  const h = String(host).split(':')[0].toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

function isPrivateIPv4Host(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return false;
  const [a, b] = h.split('.').map(Number);
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

/** 本机非回环 IPv4（用于局域网扫码） */
export function listLocalIpv4Addresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push({ name, address: net.address });
      }
    }
  }
  return out;
}

/** 优先真实网卡 IP，降低 VMware/VirtualBox 虚拟网卡误选概率 */
export function pickBestLanIPv4() {
  const addrs = listLocalIpv4Addresses();
  if (!addrs.length) return null;

  const scored = addrs.map(({ name, address }) => {
    let score = 0;
    if (/^192\.168\.\d+\.\d+$/.test(address)) score += 10;
    if (/^10\.\d+\.\d+\.\d+$/.test(address)) score += 8;
    if (!/^192\.168\.(44|230|56|72)\./.test(address)) score += 5;
    if (!address.endsWith('.1')) score += 2;
    if (/Wi-?Fi|WLAN|无线|Ethernet|以太网|en0|eth/i.test(name)) score += 3;
    if (/VMware|VirtualBox|Hyper-V|vEthernet|WSL|Docker|Loopback|TAP|TUN/i.test(name)) score -= 8;
    return { address, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.address || addrs[0].address;
}

function configuredHostOnLocalMachine(host) {
  const h = String(host || '').trim().toLowerCase();
  if (!h || h === 'localhost') return true;
  if (h === '127.0.0.1' || h === '::1') return true;
  return listLocalIpv4Addresses().some(({ address }) => address.toLowerCase() === h);
}

function parseConfiguredPublicBaseUrl() {
  const raw = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      raw,
      protocol: u.protocol || 'http:',
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? '443' : '80')
    };
  } catch {
    return { raw, protocol: 'http:', hostname: '', port: String(process.env.PORT || 3001) };
  }
}

/**
 * 读取 .env 中的 PUBLIC_BASE_URL，并在内网 IP 配错时自动纠正为本机可达地址。
 * 域名 / 公网 HTTPS 地址不会被改写。
 */
export function resolveConfiguredPublicBaseUrl() {
  const parsed = parseConfiguredPublicBaseUrl();
  if (!parsed) {
    const lan = pickBestLanIPv4();
    if (lan) return `http://${lan}:${process.env.PORT || 3001}`;
    return `http://127.0.0.1:${process.env.PORT || 3001}`;
  }

  const { raw, protocol, hostname, port } = parsed;
  const apiPort = String(process.env.PORT || 3001);
  const effectivePort = port === '80' || port === '443' ? port : port || apiPort;

  if (isPrivateIPv4Host(hostname) && !configuredHostOnLocalMachine(hostname)) {
    const lan = pickBestLanIPv4();
    if (lan) {
      const usePort = effectivePort === '80' || effectivePort === '443' ? '' : `:${effectivePort}`;
      return `${protocol}//${lan}${usePort}`.replace(/\/+$/, '');
    }
  }

  return raw;
}

/** 启动/排错：PUBLIC_BASE_URL 是否与当前机器网卡一致 */
export function diagnosePublicBaseUrl() {
  const configured = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const effective = resolveConfiguredPublicBaseUrl();
  const locals = listLocalIpv4Addresses().map((x) => x.address);

  if (!configured) {
    return {
      ok: locals.length > 0,
      configured: '',
      effective,
      localAddresses: locals,
      message: locals.length
        ? `未配置 PUBLIC_BASE_URL，已自动使用 ${effective}（手机扫码须与此地址同网段可达）`
        : '未配置 PUBLIC_BASE_URL，且未检测到局域网 IPv4，手机扫码可能失败'
    };
  }

  let hostname = '';
  try {
    hostname = new URL(configured).hostname;
  } catch {
    return { ok: false, configured, effective, localAddresses: locals, message: 'PUBLIC_BASE_URL 格式无效' };
  }

  if (isPrivateIPv4Host(hostname) && !configuredHostOnLocalMachine(hostname)) {
    return {
      ok: true,
      configured,
      effective,
      localAddresses: locals,
      autoCorrected: configured !== effective,
      message: `PUBLIC_BASE_URL 主机 ${hostname} 不在本机网卡上（本机: ${locals.join(', ') || '无'}），二维码链接已自动纠正为 ${effective}。请更新 server/.env 后重启。`
    };
  }

  return {
    ok: true,
    configured,
    effective,
    localAddresses: locals,
    message: `PUBLIC_BASE_URL ok: ${effective}`
  };
}

/**
 * 对外可见的站点 origin（二维码、绝对链接用）。
 * - 手机扫码时以请求的 Host 为准，避免 .env 里仍是 localhost 导致外置浏览器打开错误地址甚至空白页。
 * - 本机访问 API（Host 为 localhost）时，可回退到 PUBLIC_BASE_URL（如局域网 IP）。
 */
export function resolvePublicBaseUrl(req) {
  const configured = resolveConfiguredPublicBaseUrl();

  if (req) {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
    if (host) {
      const origin = `${proto}://${host}`.replace(/\/+$/, '');
      if (!isLoopbackHost(host)) return origin;
      if (configured) return configured;
      return origin;
    }
  }

  if (configured) return configured;
  return `http://127.0.0.1:${process.env.PORT || 3001}`;
}

/**
 * 公开报告页与 `/uploads` 同域服务。库里常存 `http://localhost:3001/uploads/...`，
 * 手机扫码后无法解析本机 localhost。转为相对路径后由当前页面 origin 加载。
 */
export function normalizePublicAssetUrl(url) {
  if (url == null || url === '') return url;
  const t = String(url).trim();
  if (!t) return url;
  if (t.startsWith('/')) return t;
  try {
    const u = new URL(t);
    if (u.pathname.startsWith('/uploads/')) {
      return u.pathname + u.search + u.hash;
    }
  } catch {
    /* 非绝对 URL 则原样返回 */
  }
  return url;
}
