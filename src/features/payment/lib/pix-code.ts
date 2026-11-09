export function buildPixCode(amount: number, txid: string) {
  const val = amount.toFixed(2);
  const merchant = "GOROLE PAGAMENTOS LTDA";
  const gui = "0014br.gov.bcb.pix0136a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
  const payload =
    `000201010212` +
    `26${String(gui.length).padStart(2, "0")}${gui}` +
    `52040000530398654${String(val.length).padStart(2, "0")}${val}` +
    `5802BR59${String(merchant.length).padStart(2, "0")}${merchant}` +
    `6009SAO PAULO62${String(txid.length + 4).padStart(2, "0")}05${String(txid.length).padStart(2, "0")}${txid}6304`;
  // fake CRC16
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return payload + crc.toString(16).toUpperCase().padStart(4, "0");
}
