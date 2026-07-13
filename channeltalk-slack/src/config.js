// 환경 변수를 한 곳에서 읽어 검증하는 설정 모듈.
// .env 를 쓰려면 `node --env-file=.env server.js` 로 실행하면 됩니다 (Node 20+).

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.warn(`[config] 환경 변수 ${name} 가 설정되지 않았습니다. 해당 기능은 동작하지 않습니다.`);
  }
  return value ?? '';
}

export const config = {
  port: Number(process.env.PORT ?? 3000),

  channeltalk: {
    accessKey: required('CHANNELTALK_ACCESS_KEY'),
    accessSecret: required('CHANNELTALK_ACCESS_SECRET'),
    webhookSecret: process.env.CHANNELTALK_WEBHOOK_SECRET ?? '',
    botName: process.env.CHANNELTALK_BOT_NAME ?? 'CS봇',
    baseUrl: process.env.CHANNELTALK_BASE_URL ?? 'https://api.channel.io',
  },

  claude: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.CLAUDE_MODEL ?? 'claude-opus-4-8',
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  },

  slack: {
    botToken: required('SLACK_BOT_TOKEN'),
    channelId: required('SLACK_CHANNEL_ID'),
    signingSecret: process.env.SLACK_SIGNING_SECRET ?? '',
  },
};
