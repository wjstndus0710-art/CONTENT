import {createApp} from '../server.js';
import path from 'node:path';
const server=createApp(process.argv[2]?path.resolve(process.argv[2]):undefined);
server.listen(0,'127.0.0.1',()=>server.close());
