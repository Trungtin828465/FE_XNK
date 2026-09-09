# XNK Management Frontend

Frontend quản lý xuất nhập khẩu, chứng từ và tiến độ đơn hàng.

## Chạy local

1. Tạo file `.env`:

   ```env
   NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
   ```

2. Cài đặt và chạy:

   ```bash
   npm install
   npm run dev
   ```

Ứng dụng chạy mặc định tại `http://localhost:3000`.

## Kiểm tra trước khi deploy

```bash
npm run lint
npm run build
```

