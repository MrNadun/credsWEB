module.exports = function sanitizeNumber(number) {
  if (!number) return '';
  return number.replace(/\D/g, '');
};
