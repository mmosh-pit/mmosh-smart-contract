# MMOSH Lineage Smart Contract


## Software requirement
1. ubuntu 20+ or mac os
2. Rust stable 1.71 +
3. Solana 1.14.16
4. Anchor 0.27.0
5. nodejs stable 18+

## Account Configuration Steps
1. Copy tests/_account/id.json file and replace your solana cli wallet default kepair
2. Change wallet path in anchor.toml file 

## Configure MMOSH token
1. download MMOSH program from github - https://github.com/mmosh-pit/MMOSH-program
2. create new mmosh token and copy the token address
3. update the token address in tests/web3Consts.ts
   <pre>  oposToken: new web3.PublicKey("TOKEN_ADDRESS")</pre>

## Amman configuration Steps
1 Configure amman as root user
   <pre>npm install -g @metaplex-foundation/amman</pre>
3. Download metaplex js from github- https://github.com/metaplex-foundation/js
4. Run following command to run local solana validator along with metaplex contracts
    <pre>amman start .ammanrc.js</pre>

## Test Case Command
1. Install npm
   <pre>npm install </pre>
1. To run test with deployment 
   <pre>anchor test --skip-local-validator </pre>
2. To run test without deployment
   <pre>anchor test --skip-local-validator --skip-deploy </pre>