import { createApp } from './app.js';
import { scheduleBackups } from './backup.js';
import { config } from './config.js';
import { createDb, migrate } from './db/client.js';
import { ensureCurriculum } from './db/curriculum.js';
import { adminExists } from './routes/auth.js';

const { client, db } = createDb();
await migrate(client);
const created = await ensureCurriculum(db);
if (created.length) console.log(`Estrutura inicial criada: ${created.join(' e ')}.`);
scheduleBackups(client);

if (!(await adminExists(db))) {
  console.log('\n  ⚠  Nenhum Administrador ainda. Abra o app → "Criar conta" → "Administrador" (a opção some depois de usada).\n');
}

createApp(db, client).listen(config.port, () => {
  console.log(`Escola+ rodando em http://localhost:${config.port} (${config.env})`);
});
