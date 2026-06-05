自定义 API 通用代理说明

这个版本只修改 API 连接逻辑，游戏剧情和其它规则不变。

如果你的自定义 API 在浏览器里直接测试失败，多半是 CORS 限制。请把 api/chat.js 部署到 Vercel。部署完成后，在游戏 API 设置里填写：

API 服务商：自定义 API
API Key：你的服务商密钥
API Base URL：真实 API 地址，例如 https://api.example.com/v1 或完整 /chat/completions 地址
模型名称：你的模型名
接口格式：OpenAI兼容 / Gemini / Claude / DashScope / 通用文本接口等
代理服务器 URL：https://你的vercel项目.vercel.app/api/chat

注意：代理代码不写死任何 Key。Key 由玩家在游戏中填写，并随请求发送给代理。
