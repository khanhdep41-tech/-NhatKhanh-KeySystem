# NhatKhanh Key System

Bộ starter API + Discord bot cho NhatKhanh Hub.

## Có sẵn
- API `/api/verify`: kiểm tra Key + HWID
- 1 Key chỉ bind được 1 HWID
- Key hết hạn / disabled sẽ bị từ chối
- Discord `/panel`
- Redeem Key
- Get Role (tìm role theo tên `Premium`)
- Reset HWID (Admin)
- Get Stats
- Get Script
- 100 Key 1 tháng mẫu trong `keys.json`

## Deploy Render
1. Tạo GitHub repo riêng, ví dụ `NhatKhanh-KeySystem`.
2. Upload toàn bộ file trong thư mục này.
3. Render → New Web Service → chọn repo.
4. Runtime: Node.
5. Build Command: `npm install`
6. Start Command: `npm start`
7. Thêm Environment Variables theo `.env.example`.

## Quan trọng
- KHÔNG upload Bot Token thật vào GitHub.
- `API_SECRET` phải là chuỗi bí mật dài.
- `SCRIPT_URL` hiện trỏ tới nguồn Lua public. Đây KHÔNG phải bảo mật tuyệt đối; người dùng có thể lấy URL đó.
- `keys.json` trên Render free không phải nơi lưu trữ dữ liệu bền vững. Khi triển khai thật nên chuyển dữ liệu Key sang database/persistent storage.
- 100 Key mẫu có hạn từ 2026-10-01 đến 2026-10-31 UTC.

## Test API
GET `/health`

POST `/api/verify` với header:
`x-api-secret: YOUR_API_SECRET`

JSON:
```json
{
  "key": "NKH-XXXXX-XXXXX-XXXXX",
  "hwid": "YOUR_HWID"
}
```
