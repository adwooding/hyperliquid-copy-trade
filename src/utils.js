export function formatAmount(amount) {
  return parseFloat(amount.toString()).toPrecision(4);
}

export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

export function logOrder(order) {
  const sideSign = order.side === 'buy' ? '+' : '-';
  const formattedAmount = formatAmount(order.amount);
  const formattedTimestamp = formatTimestamp(order.timestamp);
  console.log(
    `${formattedTimestamp} ${order.symbol} ${sideSign}${formattedAmount}`
  );
}
