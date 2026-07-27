Generate a Test Wallet (BNB Chain)

node -e "import { Wallet } from 'ethers'; const wallet = Wallet.createRandom(); console.log('Mnemonic:', wallet.mnemonic.phrase); console.log('Address:', wallet.address); console.log('Private Key:', wallet.privateKey);"


Test Wallet 1: 

Mnemonic: [REDACTED — store in password manager, never in repo]
Address: 0x8cFc3BD1B4e17f8373864DbfF5318ED020b8B916
Private Key: [REDACTED]


################################################### BTC Wallets ################################################### 

Mnemonic: [REDACTED]
Testnet XPUB: tpubD6NzVbkrYhZ4XeipKGUSCdiVGgN27DoMTWad4XopHYqHiAinPGxmDywKPb662VtXRhxS89oXHv21kU7PHYR57nQVU6KLdKYSEYcBkPFzq8P
Testnet XPRV: [REDACTED]

Main Master Wallet: 

Mnemonic: [REDACTED]
Testnet BTC Address: tb1q3les4jsyusjys9544kzxhnfy9zrkc3cp6c4ck2
Private Key (WIF): [REDACTED]

User 1:

Mnemonic: [REDACTED]
Private Key (WIF): [REDACTED]
Testnet BTC Address: tb1qdvyjnrhx8dk97sn5eyxktudrr7yh49tqxs6af6

User 2: 

Mnemonic: [REDACTED]
Private Key (WIF): [REDACTED]
Testnet BTC Address: tb1q6e20ms8k83t7fgrr8wweleqjnyennvhyf82czv

------------------------------------------------------------------------------------------

~/.bitcoin/bitcoin.conf

server=1
txindex=1

[test]
rpcuser=btcuser
rpcpassword=[REDACTED]
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=18332

zmqpubrawtx=tcp://127.0.0.1:28332
zmqpubrawblock=tcp://127.0.0.1:28333

------------------------------------------------------------------------------------------

/etc/systemd/system/bitcoind.service

[Unit]
Description=Bitcoin daemon
After=network.target

[Service]
ExecStart=/usr/local/bin/bitcoind -daemon -testnet -conf=/home/pi/.bitcoin/bitcoin.conf -pid=/home/pi/.bitcoin/bitcoind.pid
ExecStop=/usr/local/bin/bitcoin-cli -testnet stop
Restart=always
User=pi
Group=pi
Type=forking
PIDFile=/home/pi/.bitcoin/bitcoind.pid
TimeoutStopSec=600

[Install]
WantedBy=multi-user.target

################################################## The testing commands ##################################################


Create a new wallet: 

bitcoin-cli -testnet createwallet "legacywallet" false false "" false false true

Add the existing wallet using priv key:

bitcoin-cli -testnet -rpcwallet=mywallet importprivkey [WIF-KEY]

Verify that the address shows up: 

bitcoin-cli -testnet -rpcwallet=legacywallet getaddressesbylabel ""

Do a manual rescan (Needed to get past transactions):

bitcoin-cli -testnet -rpcwallet=legacywallet rescanblockchain

Check wallet Balance: 

bitcoin-cli -testnet -rpcwallet=legacywallet getbalance

P.S: if it shows 0 as balance, check if the sync has completed via:

bitcoin-cli -testnet getblockchaininfo | grep verificationprogress


Start Bitcoin Daemon: bitcoind -daemon -datadir=/home/pi/.bitcoin

Config File: 

server=1
deprecatedrpc=create_bdb

server=1
rpcuser=btcuser
rpcpassword=[REDACTED]
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=8332
zmqpubrawtx=tcp://127.0.0.1:28332
zmqpubrawblock=tcp://127.0.0.1:28333
prune=550
maxconnections=50

Transfer files: 

scp -r ~/Desktop/bitcoin_node/* pi@31.97.189.9:/home/pi/.bitcoin/
rsync -avz --info=progress2 ~/Desktop/bitcoin_node/ pi@31.97.189.9:/home/pi/.bitcoin/


Sync Command: 
./Bitcoin-Qt -daemon -prune=550 -datadir=$HOME/Desktop/bitcoin_node -conf=$HOME/Desktop/bitcoin_node/bitcoin.conf

Find Transactions using xpub

bitcoin-cli scantxoutset start '[{"desc":"wpkh(xpub-here/*)", "range":1000}]'


bitcoin-cli scantxoutset start '[{"desc":"wpkh(xpub-here/0/*)", "range":1000}]'


Create a Watcher Wallet: 

// no priv keys and stuff 

bitcoin-cli createwallet watchonly true true "" true

// Get the checksum

bitcoin-cli getdescriptorinfo "wpkh(xpub-here/0/*)"

// provide it with descriptor

bitcoin-cli -rpcwallet=watchonly importdescriptors \
'[{"desc":"wpkh(xpub-here/0/*)#checksum","active":true,"range":[0,1000],"timestamp":"now"}]'

bitcoin-cli -rpcwallet=descriptor-wallet-1758185373792 getbalance

bitcoin-cli -rpcwallet=watchonly importdescriptors '[{"desc":"wpkh(xpub6CWRa5rJTWCGASu1oWWV6tcqjBSTbBobmGmbuYvhb26XHKri5sm8Fpo584iDx5JPsu6xiqjvsUc7wjnzS3ZEZb7X7bmq3TF7bpSC82Gb9cj/0/*)#myyee7kh","active":true,"range":[0,1000],"timestamp":"now"}]'

bitcoin-cli getdescriptorinfo "wpkh(xpub6CWRa5rJTWCGASu1oWWV6tcqjBSTbBobmGmbuYvhb26XHKri5sm8Fpo584iDx5JPsu6xiqjvsUc7wjnzS3ZEZb7X7bmq3TF7bpSC82Gb9cj/0/*)"


node /home/pi/bitcoin_mining_backend/helpers/derive-child.js "[XPRV]" 0 5

node /home/pi/bitcoin_mining_backend/helpers/find-private-by-address.js "[XPRV]" bc1qqy9cuqvkrmwfqcwq9trl9jwklwlnraj3z8w80r 0 0 500 p2wpkh

node /home/pi/bitcoin_mining_backend/helpers/find-private-add-dv.js "[XPRV]" bc1qqy9cuqvkrmwfqcwq9trl9jwklwlnraj3z8w80r "0/8" p2wpkh

node /home/pi/bitcoin_mining_backend/helpers/find-private-add-dv.js "[XPRV]" bc1q04qjfjaxhehuhzhhrna8urlx6z777vqaem735r "0/10" p2wpkh


node /home/pi/bitcoin_mining_backend/helpers/get-child-private.js "[XPRV]" 10 p2wpkh

node /home/pi/bitcoin_mining_backend/helpers/child-priv-key.js "[XPRV]/44h/0h/0h/0" 10 pkh

node /home/pi/bitcoin_mining_backend/helpers/check-and-sweep-wif.mjs [WIF-KEY]
