# AgriStock — Hướng dẫn cho AI coding agent

## Nguồn yêu cầu và phạm vi

- Đọc [SPEC.md](./SPEC.md) trước khi phân tích hoặc sửa tính năng. Đây là nguồn yêu cầu nghiệp vụ chính thức; không tự sửa, ghi đè hoặc diễn giải khác các business rule, API contract hay acceptance criteria.
- Chỉ triển khai trong phạm vi MVP của Spec. Không tự thêm nghiệp vụ, endpoint hay tính năng ngoài phạm vi.
- Khi Spec thiếu, mâu thuẫn hoặc đánh dấu `SPEC GAP`, không tự biến đề xuất thành yêu cầu đã duyệt. Dừng phần bị ảnh hưởng, nêu câu hỏi cần xác nhận và chỉ tiếp tục phần độc lập với gap đó.

## Công nghệ và cấu trúc

- Nền tảng mục tiêu: Node.js 20, Express 4, MySQL 8, Sequelize 6; frontend React/Vite; unit test Vitest; dùng Supertest khi phù hợp để kiểm thử HTTP.
- Trước khi thay đổi, kiểm tra cấu trúc, package manifests, scripts, framework và quy ước hiện có. Ưu tiên tái sử dụng; không nâng cấp dependencies hoặc thêm công cụ nếu không cần thiết. Không giả định một script tồn tại: dùng đúng script đã khai báo và báo rõ nếu không có.
- Theo phân tách trách nhiệm của dự án: `routes` khai báo endpoint/middleware; `controllers` nhận request, gọi service và trả response; `services` xử lý nghiệp vụ; `models` ánh xạ dữ liệu; `middlewares` xử lý xác thực, phân quyền và lỗi; `validators` kiểm tra input khi kiến trúc cần; `tests` chứa unit/integration tests. Không dồn nghiệp vụ vào controller.
- Tuân theo cấu trúc và phong cách đã có trong repo; chỉ thêm cấu trúc khi cần cho thay đổi được yêu cầu.

## Quy tắc triển khai

- Mặc định dùng `const`, chỉ dùng `let` khi cần gán lại; dùng `async/await` cho tác vụ bất đồng bộ và tên biến/hàm thể hiện rõ ý nghĩa.
- Tách validation, nghiệp vụ và truy cập dữ liệu. Dùng Sequelize parameterization/query bindings; không ghép dữ liệu người dùng trực tiếp vào SQL.
- Tuân thủ response envelope, status và mã lỗi trong Spec; không trả stack trace, secret hoặc chi tiết nội bộ cho client.
- Với nhập/xuất kho, lưu phiếu và cập nhật tồn trong cùng transaction. Bảo vệ kiểm tra/trừ tồn trước race condition bằng cơ chế nguyên tử phù hợp với MySQL/Sequelize; lỗi hoặc rollback không được để lại phiếu dở dang hay thay đổi tồn một phần.
- Xử lý request lặp theo Spec. Không làm suy yếu idempotency, authentication, authorization hoặc validation để thuận tiện triển khai/test.

## Database và bảo mật

- Không tự ý đổi schema, xóa dữ liệu hoặc thực hiện thao tác phá hủy. Nếu dự án dùng migrations, mọi thay đổi schema phải có migration rõ ràng.
- Không dùng `sequelize.sync({ alter: true })` hoặc `force: true` để sửa schema trong môi trường có dữ liệu. Giữ nhất quán tên cột database và thuộc tính Sequelize theo quy ước hiện có.
- Không dùng dữ liệu giả thay database thật trong luồng nghiệp vụ. Không cập nhật tồn bằng chu trình đọc rồi ghi thiếu kiểm soát đồng thời.
- Không bỏ middleware authentication để test chạy qua; không tin `userId`, role hoặc quyền do client gửi. Chỉ dùng danh tính/quyền từ ngữ cảnh xác thực phía server và không trả dữ liệu ngoài quyền truy cập.
- Không ghi token, mật khẩu hoặc secret vào log; không đưa `.env` chứa secret vào Git. Không tắt validation hay authorization để né lỗi.

## Kiểm thử

Với mỗi lát cắt tính năng, làm theo TDD:

1. Đọc Spec và xác định business rule cùng acceptance criteria liên quan.
2. Viết test trước implementation; khi phù hợp, xác nhận test thất bại do chức năng chưa có.
3. Viết thay đổi nhỏ nhất đáp ứng yêu cầu.
4. Chạy test mới và các test hồi quy liên quan; dùng scripts/công cụ hiện có.
5. Báo chính xác lệnh đã chạy và kết quả. Không tuyên bố PASS nếu chưa thực sự chạy.

Không sửa/xóa assertion chỉ để test pass, không mock chính logic đang cần kiểm tra và không xóa test thất bại trước khi xác định nguyên nhân.

## Không làm

- Không tự thêm business rule, mở rộng scope, thay đổi response contract hoặc thay dependencies hàng loạt.
- Không sửa Spec để hợp thức hóa implementation. Nếu contract cần thay đổi, yêu cầu người dùng xác nhận và cập nhật Spec cùng test theo quyết định đó.
- Không thực hiện thao tác phá hủy database/dữ liệu hoặc tạo kết quả review không có bằng chứng.

## Báo cáo sau tác vụ

Nêu ngắn gọn:

- File đã tạo hoặc sửa.
- Business rule/acceptance criteria đã xử lý.
- Test và lệnh đã chạy cùng kết quả chính xác; ghi rõ nếu không chạy.
- Giới hạn còn lại và các `SPEC GAP` cần người dùng xác nhận.
