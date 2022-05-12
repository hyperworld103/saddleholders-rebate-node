const Web3 = require("web3");
const axios = require('axios');

const BN = Web3.utils.BN;

const ERC20_ABI = require('./abi/erc20.json');
const ERC1155_ABI = require('./abi/erc1155.json');
const { SSL_OP_EPHEMERAL_RSA } = require("constants");


const LPTOKEN_ADDRESS = [
    "0xd48cF4D7FB0824CC8bAe055dF3092584d0a1726A", // D4 Pool
    "0x5F7872490a9B405946376dd40fCbDeF521F13e3f", // wCUSD Metapool V2
    "0xb6214a9d18f5Bf34A23a355114A03bE4f7D804fa", // sUSD Metapool V2
    "0x5f86558387293b6009d7896A61fcc86C17808D62", // Stable Coin V2 / USD Pool V2
    "0xc9da65931ABf0Ed1b74Ce5ad8c041C4220940368", // alEth Pool
    "0x3f2f811605bC6D701c3Ad6E501be13461c560320", // tBTCv2 MetaPool V2
    "0xF32E91464ca18fc156aB97a697D6f8ae66Cd21a3"  // BTC Pool V2
];

const GALAXY_ADDRESS = "0xe374B4dF4cF95eCc0B7C93b49d465A1549f86CC0";
const INFURA_KEY = "1ea7cae0ed014a7eb5a92d7720e1b039";
const MORALIS_KEY = "jOwVm57fkxn5dHLGTMFlRnnnx1SPw3EuAYiWk4k4Sr7qp4QFiqDTk1HvimU87R3d";
    
const web3 = new Web3(
    new Web3.providers.HttpProvider("https://mainnet.infura.io/v3/" + INFURA_KEY)
);

let nft_holders = {};
let filtered_holders = {}

async function check_lp_holders() {
    let balances = {};
    for(let i = 0; i < LPTOKEN_ADDRESS.length; i++) {
        const contract = new web3.eth.Contract(ERC20_ABI, LPTOKEN_ADDRESS[i]);
        const events = await contract
        .getPastEvents("Transfer", {
            fromBlock: 0,
            toBlock: 'latest',
        });

        events.forEach((event) => {
            const {from, to, value} = event.returnValues;
            if(from !== '0x0000000000000000000000000000000000000000') {
                balances[from] = balances[from].sub(new BN(value)); 
            }
            if(to !== '0x0000000000000000000000000000000000000000') {
                if(balances[to] === undefined) balances[to] = new BN(0);
                balances[to] = balances[to].add(new BN(value)); 
            }
        });      
    }
    const keys = Object.keys(balances);
    let count = 0;
    let count1 = 0;
    keys.forEach((key, index) => {
        nft_count = nft_holders[key];
        if(!balances[key].eq(new BN(0))){
            if(nft_count !== undefined) {
                filtered_holders[key] = nft_count.toNumber();
                count1 ++;
            }
            count++;
        }
    });
    console.log("Saddle LP holders: ", count);
    console.log("Saddle LP & NFT hHolders: ", count1);
}

async function add_galaxy_nftholders() {
    const contract = new web3.eth.Contract(ERC1155_ABI, GALAXY_ADDRESS);
    let balances = {};
    const events = await contract
    .getPastEvents("TransferSingle", {
        fromBlock: 0,
        toBlock: 'latest',
    });

    events.forEach((event) => {
        const {from, to, id, value} = event.returnValues;
        if(from !== '0x0000000000000000000000000000000000000000') {
            balances[from] = balances[from].sub(new BN(value)); 
        }
        if(to !== '0x0000000000000000000000000000000000000000') {
            if(balances[to] === undefined) balances[to] = new BN(0);
            balances[to] = balances[to].add(new BN(value)); 
        }
    });

    let count = 0;
    const keys = Object.keys(balances);
    keys.forEach((key, index) => {
        if(!balances[key].eq(new BN(0))) {
            if(nft_holders[key] === undefined)  nft_holders[key] = new BN(0);
            nft_holders[key] = nft_holders[key].add(balances[key]);
            count++;
        }
    });
    console.log("Galaxy NFT Holders: ", count);
}

async function add_opensea_nftholders() {
    const {collection_address, assets_ids} = require('./saddle-nfts/opensea.json');
    function sleep(ms) {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
      } 
    for(let i = 0; i < assets_ids.length; i++) {
        const res = await axios.get(`https://deep-index.moralis.io/api/v2/nft/${collection_address}/${assets_ids[i]}/owners?chain=eth&format=decimal`, {
            timeout: 10000,           
            headers: {
                'content-type': 'application/json',
                'x-api-key': MORALIS_KEY
            }
        });
        let owner = res.data.result[0].owner_of;
        if(nft_holders[owner] === undefined ) nft_holders[owner] = new BN(0);
        nft_holders[owner] = nft_holders[owner].add(new BN(1));
    }
    console.log("Opensea NFT Holders: ", assets_ids.length);
}

async function calc_monthgasfee(address, from_date) {
    const limit = 500;
    let totalGasFee = new BN(0);
    for(let offset = 0;;offset += limit) {
        const response = await axios.get(`https://deep-index.moralis.io/api/v2/${address}?chain=eth&offset=${offset}&limit=${limit}&from_date=${from_date}`, {
            timeout: 10000,           
            headers: {
                'content-type': 'application/json',
                'x-api-key': MORALIS_KEY
            }
        });
        let transactions = response.data['result'];
        if(transactions.length == 0) break;
        transactions.forEach((transaction) => {
            if(transaction.from_address !== address.toLocaleLowerCase()) return;
            totalGasFee = totalGasFee.add((new BN(transaction.gas_price)).mul(new BN(transaction.gas)));
        })
    }
    return totalGasFee;
}
async function get_coin_price(coin) {
    let res = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
    return res.data[coin].usd;
}

async function save_csv() {
    let ether_price = await get_coin_price('ethereum');
    console.log("Ether Price: ", ether_price, "$");

    let from_date = new Date();
    let d = from_date;
    let ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d);
    let mo = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(d);
    let da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(d);
    filename = `${ye}-${mo}-${da}`;

    from_date.setDate(from_date.getDate() - 30);
    const keys = Object.keys(filtered_holders);
    let count = 0;
    let saddle_holders = [];
    for(let i = 0; i < keys.length; i++) {
        let address = keys[i];
        let type = "wallet";
        let gas_fee = await calc_monthgasfee(address, from_date);
        let code = await web3.eth.getCode(address);
        if(code !== "0x") type = "contract";
        gas_fee = web3.utils.fromWei(gas_fee, 'ether');
        usd_price = Number(gas_fee) * ether_price;
        console.log(address, gas_fee, usd_price);
        saddle_holders.push({
            address,
            type,
            nft_count: filtered_holders[address],
            gas_fee,
            usd_price
        })
    }
    
    
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    const csvWriter = createCsvWriter({
        path: `${filename}.csv`,
        header: [
            {id: 'address', title: 'Address'},
            {id: 'type', title: 'Type'},
            {id: 'nft_count', title: 'NFTs'},
            {id: 'gas_fee', title: 'GasFee(ETH)'},
            {id: 'usd_price', title: "GasFee(USD)"}
        ]
    });
    await csvWriter.writeRecords(saddle_holders);
}

(async() => {
    await add_opensea_nftholders(); 
    await add_galaxy_nftholders();
    await check_lp_holders();
    await save_csv();
})();
  
