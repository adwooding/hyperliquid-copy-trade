import { hyperliquid, pro } from 'ccxt';
import ccxt from 'ccxt';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { logOrder } from './utils.js';

dotenv.config();

const config = {
  traderAddress: process.env.TRADER_ADDRESS || '',
  userAddress: process.env.USER_ADDRESS || '',
  userPrivateKey: process.env.USER_PRIVATE_KEY || '',
  copyValue: parseFloat(process.env.COPY_VALUE || '0'),
  maxLeverage: parseInt(process.env.MAX_LEVERAGE || '1', 10)
};

// const fetchWrapper = (url, options = {}) => {
//   const { agent, ...restOptions } = options;
//   return fetch(url, restOptions);
// };

// ccxt.hyperliquid.prototype.fetch = fetchWrapper;
// ccxt.pro.hyperliquid.prototype.fetch = fetchWrapper;

let running = false;
let traderAccount;
let userAccount;
let orders = [];

async function copy() {
  if (running) {
    await stop();
    return;
  }

  if (
    !config.traderAddress ||
    !config.userAddress ||
    !config.userPrivateKey ||
    !config.copyValue ||
    !config.maxLeverage
  ) {
    console.error('Please fill all fields in the .env file.');
    return;
  }

  const updatedLeverage = {};
  running = true;

  traderAccount = new ccxt.pro.hyperliquid({
    walletAddress: config.traderAddress,
    fetchImplementation: fetch
  });

  userAccount = new ccxt.hyperliquid({
    walletAddress: config.userAddress,
    privateKey: config.userPrivateKey,
    fetchImplementation: fetch
  });

  let markets = await userAccount.loadMarkets();
  console.log(
    `Starting copy trading ${config.traderAddress} -> ${config.userAddress} with ${config.copyValue} USDC.`
  );
  let startTime = Date.now();

  while (running) {
    try {
      const trades = await traderAccount.watchMyTrades();
      for (const trade of trades) {
        if (trade.timestamp && trade.timestamp < startTime) {
          continue;
        }
        try {
          if (trade.symbol && !updatedLeverage[trade.symbol]) {
            try {
              let market = trade.symbol ? markets[trade.symbol] : undefined;
              if (market) {
                let leverage = Math.min(
                  config.maxLeverage,
                  market.info.maxLeverage
                );
                await userAccount.setMarginMode('cross', trade.symbol, {
                  leverage: leverage
                });
              }
            } catch (e) {
              console.log(
                'set_margin_mode error',
                e instanceof Error ? e.toString() : String(e)
              );
            }
            if (trade.symbol) {
              updatedLeverage[trade.symbol] = true;
            }
          }

          if (trade.symbol && trade.side && trade.price) {
            let tradeAmount = config.copyValue / trade.price;
            let order = await userAccount.createOrder(
              trade.symbol,
              'limit',
              trade.side,
              tradeAmount,
              trade.price
            );
            let orderDetails = await userAccount.fetchOrder(
              order.id,
              trade.symbol
            );
            console.log(orderDetails);
            let orderAmount = orderDetails.amount
              ? orderDetails.amount
              : orderDetails.info.order.origSz;

            if (
              orderDetails.symbol &&
              orderDetails.side &&
              orderDetails.timestamp
            ) {
              const newOrder = {
                symbol: orderDetails.symbol.split('/')[0],
                side: orderDetails.side,
                amount: orderAmount,
                timestamp: orderDetails.timestamp
              };

              orders.push(newOrder);
              logOrder(newOrder);
            }
          }
        } catch (e) {
          console.log(e instanceof Error ? e.toString() : String(e));
        }
      }
    } catch (e) {
      startTime = Date.now(); // reset start time
      console.log(
        'watchMyTrades error',
        e instanceof Error ? e.toString() : String(e)
      );
    }
  }
}

async function stop() {
  running = false;
  console.log('Closing exchange accounts...');
  if (traderAccount) {
    await traderAccount.close();
  }
  if (userAccount) {
    await userAccount.close();
  }
  console.log('Stopped.');
}

process.on('SIGINT', async () => {
  console.log('Received SIGINT. Stopping...');
  await stop();
  process.exit(0);
});

copy().catch(console.error);
