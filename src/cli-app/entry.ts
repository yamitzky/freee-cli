import { main } from './index.js';

main(process.argv.slice(2)).catch((error) => {
  console.error('Error:', error.message ?? error);
  process.exit(1);
});
