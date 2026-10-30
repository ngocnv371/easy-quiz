const VND = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

export function formatVnd(amount: number): string {
  return VND.format(amount)
}
