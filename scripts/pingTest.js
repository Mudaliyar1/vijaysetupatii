const { exec } = require('child_process');

const hosts = [
    'vijay.q3kif.mongodb.net',
    'mongodb.net',
    '159.41.196.148'
];

function pingHost(host) {
    return new Promise((resolve) => {
        const command = process.platform === 'win32' ? `ping -n 1 ${host}` : `ping -c 1 ${host}`;
        
        exec(command, (error, stdout, stderr) => {
            console.log(`\nTesting connectivity to ${host}:`);
            console.log(stdout);
            resolve(!error);
        });
    });
}

async function runTests() {
    console.log('Starting connectivity tests...\n');
    
    for (const host of hosts) {
        await pingHost(host);
    }
    
    console.log('\nTests completed. If all pings failed, please:');
    console.log('1. Check your internet connection');
    console.log('2. Verify firewall settings');
    console.log('3. Try disabling VPN/proxy if using any');
    console.log('4. Add your IP to MongoDB Atlas whitelist');
}

runTests();