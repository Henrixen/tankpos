18:36:56.744 Running build in Washington, D.C., USA (East) – iad1
18:36:56.745 Build machine configuration: 2 cores, 8 GB
18:36:56.872 Cloning github.com/Henrixen/tankpos (Branch: main, Commit: fc7e5ec)
18:36:57.532 Cloning completed: 660.000ms
18:36:57.606 Restored build cache from previous deployment (BCHFyfFfmJAHXY12nNKBLEUC3NVu)
18:36:58.010 Running "vercel build"
18:36:58.026 Vercel CLI 60.1.3
18:36:58.879 Installing dependencies...
18:37:01.973 
18:37:01.974 up to date in 3s
18:37:01.974 
18:37:01.974 8 packages are looking for funding
18:37:01.974   run `npm fund` for details
18:37:01.975 npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
18:37:01.975 npm warn install-scripts   esbuild@0.21.5 (postinstall: node install.js)
18:37:01.975 npm warn install-scripts
18:37:01.975 npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
18:37:03.160 
18:37:03.162 up to date, audited 126 packages in 1s
18:37:03.162 
18:37:03.162 8 packages are looking for funding
18:37:03.163   run `npm fund` for details
18:37:03.169 
18:37:03.169 4 vulnerabilities (2 moderate, 2 high)
18:37:03.169 
18:37:03.169 To address all issues possible (including breaking changes), run:
18:37:03.170   npm audit fix --force
18:37:03.170 
18:37:03.170 Some issues need review, and may require choosing
18:37:03.170 a different dependency.
18:37:03.170 
18:37:03.170 Run `npm audit` for details.
18:37:03.170 npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
18:37:03.170 npm warn install-scripts   esbuild@0.21.5 (postinstall: node install.js)
18:37:03.170 npm warn install-scripts
18:37:03.170 npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
18:37:03.284 
18:37:03.285 > tankpos@0.0.0 build
18:37:03.285 > vite build
18:37:03.285 
18:37:03.510 vite v5.4.21 building for production...
18:37:03.567 transforming...
18:37:04.291 ✓ 66 modules transformed.
18:37:04.292 x Build failed in 751ms
18:37:04.292 error during build:
18:37:04.292 [vite:esbuild] Transform failed with 1 error:
18:37:04.292 /vercel/path0/src/FixingTab.jsx:129:0: ERROR: Unexpected end of file
18:37:04.292 file: /vercel/path0/src/FixingTab.jsx:129:0
18:37:04.292 
18:37:04.292 Unexpected end of file
18:37:04.292 127|        setTimeout(()=>{
18:37:04.292 128|          const remeasured = calcExpandedH();
18:37:04.292 129|  
18:37:04.292    |  ^
18:37:04.292 
18:37:04.292     at failureErrorWithLog (/vercel/path0/node_modules/esbuild/lib/main.js:1472:15)
18:37:04.292     at /vercel/path0/node_modules/esbuild/lib/main.js:755:50
18:37:04.292     at responseCallbacks.<computed> (/vercel/path0/node_modules/esbuild/lib/main.js:622:9)
18:37:04.292     at handleIncomingPacket (/vercel/path0/node_modules/esbuild/lib/main.js:677:12)
18:37:04.292     at Socket.readFromStdout (/vercel/path0/node_modules/esbuild/lib/main.js:600:7)
18:37:04.292     at Socket.emit (node:events:514:28)
18:37:04.292     at addChunk (node:internal/streams/readable:568:12)
18:37:04.292     at readableAddChunkPushByteMode (node:internal/streams/readable:519:3)
18:37:04.292     at Readable.push (node:internal/streams/readable:399:5)
18:37:04.292     at Pipe.onStreamRead (node:internal/stream_base_commons:189:23)
18:37:04.325 Error: Command "npm install && npm run build" exited with 1
