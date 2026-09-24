import { readConfig } from './config.js';
import { createApp } from './app.js';

try {
  const config = readConfig();
  const port = Number(process.env.PORT || 4318);
  const host = process.env.HOST || '127.0.0.1';
  const server = createApp(config).listen(port, host, () => {
    console.log(`茶饮评价助手：http://${host}:${port}（${config.demo ? '演示模式' : '真实 AI 模式'}）`);
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请修改 .env 的 PORT。` : '服务启动失败，请检查主机和端口配置。');
    process.exitCode = 1;
  });
} catch (error) {
  console.error(`配置错误：${error.message}`);
  process.exitCode = 1;
}
