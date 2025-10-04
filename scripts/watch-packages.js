#!/usr/bin/env node
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const services = ['backend', 'frontend', 'indexer-micro-service', 'agent'];

services.forEach(service => {
  const packageJsonPath = path.join(__dirname, '..', service, 'package.json');
  
  console.log(`👀 Watching ${service}/package.json for changes...`);
  
  fs.watchFile(packageJsonPath, { interval: 1000 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log(`📦 ${service}/package.json changed, running npm install in container...`);
      
      exec(`docker-compose exec ${service} npm install`, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Error installing packages for ${service}:`, error);
          return;
        }
        console.log(`✅ ${service} packages updated in container`);
        if (stdout) console.log(stdout);
        if (stderr) console.log(stderr);
      });
    }
  });
});

console.log('🚀 Package watcher started. Press Ctrl+C to stop.');
