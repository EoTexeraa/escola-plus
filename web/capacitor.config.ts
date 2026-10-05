import type { CapacitorConfig } from '@capacitor/cli';

/**
 * APK Android do Escola+.
 * O app abre o ENDEREÇO DO SERVIDOR (mesma origem da API), para o login usar cookie HttpOnly
 * (docs/security/modelo-de-ameacas.md). Defina a URL no build:
 *   ESCOLA_SERVER_URL=https://sua-escola.onrender.com npx cap sync android
 * Sem internet, aparece public/offline.html (empacotado no APK).
 */
const serverUrl = process.env.ESCOLA_SERVER_URL;
const allowHttp = process.env.ESCOLA_ALLOW_HTTP === '1'; // só para testes na rede local

if (!serverUrl && process.argv.some((a) => a === 'sync' || a === 'copy')) {
  console.warn('\n⚠  ESCOLA_SERVER_URL não definida: o APK vai abrir apenas a tela offline.\n');
}

const config: CapacitorConfig = {
  appId: 'br.escolamais.app',
  appName: 'Escola+',
  webDir: 'dist',
  server: {
    url: serverUrl,
    cleartext: allowHttp,
    errorPath: 'offline.html',
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#1D4ED8',
  },
};

export default config;
