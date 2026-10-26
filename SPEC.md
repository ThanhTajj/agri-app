# AgriStock — Đặc tả yêu cầu phần mềm MVP

**Trạng thái:** Bản yêu cầu MVP; các mục ở phần [SPEC GAP](#11-spec-gap-cần-người-dùng-xác-nhận) chưa được phê duyệt.  
**Đối tượng sử dụng:** AI Developer triển khai và AI Reviewer đối chiếu code.  
**Phạm vi:** Quản lý danh mục vật tư và số lượng tồn kho của hợp tác xã.

## 1. Mục tiêu và phạm vi MVP

AgriStock cho phép người dùng xem danh sách vật tư, tạo vật tư, ghi nhận nhập kho, ghi nhận xuất kho và theo dõi tồn kho. Vật tư bao gồm phân bón và các vật tư nông nghiệp khác.

MVP phải bảo đảm số lượng tồn nhất quán khi có lỗi, yêu cầu lặp lại hoặc thao tác đồng thời. Thay đổi số lượng chỉ được thực hiện bởi thao tác nhập/xuất kho thành công; tạo vật tư không phải là thao tác nhập kho.

### Thuật ngữ và dữ liệu

- **Vật tư:** Bản ghi có `materialId` (định danh nội bộ duy nhất, không do client tự chọn), `code`, `name`, `unit` và `stockQuantity`.
- **Định dạng `materialId`:** Khóa chính database là `BIGINT UNSIGNED`; API trả ID dạng chuỗi có tiền tố `mat_`, ví dụ `"mat_123"`. Khi endpoint nhận `materialId`, chỉ chấp nhận `mat_<số nguyên dương>` trong giới hạn `BIGINT UNSIGNED` trước khi truy vấn.
- **Mã chuẩn hóa:** Mã sau khi loại bỏ khoảng trắng đầu/cuối, thay mỗi chuỗi gồm một hay nhiều khoảng trắng liên tiếp bằng một dấu cách ASCII, rồi chuyển thành chữ hoa trước khi lưu và trả về API. So sánh trùng mã theo giá trị đã chuẩn hóa.
- **Tên/đơn vị chuẩn hóa:** Loại bỏ khoảng trắng đầu/cuối và gộp chuỗi khoảng trắng liên tiếp thành một dấu cách ASCII. Không tự chuyển hoa/thường.
- **Số lượng:** Giá trị số JSON hữu hạn, lớn hơn 0 đối với một giao dịch nhập/xuất. Quy tắc số lẻ và độ chính xác cần xác nhận tại SPEC GAP.
- **Yêu cầu lặp lại:** Một yêu cầu ghi dữ liệu được gửi lại với cùng `Idempotency-Key`, cùng người dùng đã xác thực, endpoint và payload đã chuẩn hóa trong thời hạn hiệu lực 24 giờ kể từ khi request được ghi nhận thành công.
- **Phiếu:** Bản ghi giao dịch nhập hoặc xuất kho được lưu cùng lần cập nhật tồn. Các endpoint truy vấn lịch sử phiếu không thuộc MVP.

## 2. Quy tắc nghiệp vụ

Mỗi rule dưới đây có điều kiện, kết quả mong đợi và test case nghiệm thu. Test case tham chiếu chi tiết được mô tả tại [Acceptance Criteria](#8-tiêu-chí-nghiệm-thu).

| Mã rule | Mô tả | Điều kiện | Kết quả mong đợi | Test case |
|---|---|---|---|---|
| BR-001 | Mỗi vật tư có mã, tên, đơn vị tính, số lượng tồn và định danh nội bộ. | Tạo vật tư hợp lệ. | Tạo một vật tư có `materialId` do hệ thống cấp và đủ các trường bắt buộc; tồn ban đầu mặc định bằng 0. | AC-MAT-01 |
| BR-002 | Mã vật tư phải duy nhất sau chuẩn hóa. | Mã mới chuẩn hóa trùng mã đã tồn tại. | Từ chối tạo; không tạo vật tư mới; trả `409 MATERIAL_CODE_DUPLICATE`. | AC-MAT-03 |
| BR-003 | Chuẩn hóa mã, tên và đơn vị nhất quán. | Nhận chuỗi có khoảng trắng ở đầu/cuối hoặc nhiều khoảng trắng liên tiếp. | Chuẩn hóa theo định nghĩa tại mục 1 trước khi lưu và so sánh mã. Mã được chuẩn hóa và dùng nhất quán trong response. | AC-MAT-02, AC-MAT-03 |
| BR-004 | Tên và đơn vị tính không được để trống. | `name` hoặc `unit` thiếu, rỗng hoặc chỉ có khoảng trắng. | Từ chối; trả lỗi validation theo trường; không ghi dữ liệu. | AC-MAT-04 |
| BR-005 | Số lượng tồn không được âm. | Bất kỳ thao tác nào có thể làm tồn âm hoặc request cố gửi tồn ban đầu. | Không cho ghi số lượng âm; tồn chỉ thay đổi theo giao dịch nhập/xuất hợp lệ. Không nhận `stockQuantity` do client gửi trong request tạo vật tư. | AC-MAT-05, AC-STK-05 |
| BR-006 | Nhập kho phải có số lượng lớn hơn 0 và vật tư tồn tại. | Gửi phiếu nhập có vật tư không tồn tại hoặc số lượng không hợp lệ. | Từ chối; không tạo phiếu và không thay đổi tồn. Lỗi vật tư là `404 MATERIAL_NOT_FOUND`; lỗi số lượng là `422 VALIDATION_ERROR`. | AC-STK-01, AC-STK-03 |
| BR-007 | Nhập kho thành công tăng tồn đúng bằng số lượng nhập. | Phiếu nhập hợp lệ và được ghi thành công. | Lưu phiếu và cập nhật tồn trong cùng transaction; `stockQuantityAfter = stockQuantityBefore + quantity`. | AC-STK-02 |
| BR-008 | Nhập kho thất bại không thay đổi tồn. | Validation, lỗi ghi phiếu, lỗi cập nhật tồn hoặc transaction rollback. | Không lưu phiếu dở dang và tồn giữ nguyên. | AC-STK-03, AC-STK-08 |
| BR-009 | Xuất kho phải có số lượng lớn hơn 0 và vật tư tồn tại. | Gửi phiếu xuất có vật tư không tồn tại hoặc số lượng không hợp lệ. | Từ chối; không tạo phiếu và không thay đổi tồn. Lỗi vật tư là `404 MATERIAL_NOT_FOUND`; lỗi số lượng là `422 VALIDATION_ERROR`. | AC-STK-01, AC-STK-03 |
| BR-010 | Không cho xuất vượt tồn kho. | Số lượng xuất lớn hơn tồn khả dụng tại thời điểm ghi nhận. | Từ chối với `409 INSUFFICIENT_STOCK`; tồn và phiếu không đổi. | AC-STK-04 |
| BR-011 | Xuất kho thành công giảm tồn đúng bằng số lượng xuất. | Phiếu xuất hợp lệ, đủ tồn và được ghi thành công. | Lưu phiếu và cập nhật tồn trong cùng transaction; `stockQuantityAfter = stockQuantityBefore - quantity`. | AC-STK-05 |
| BR-012 | Xuất đồng thời không được làm tồn âm hoặc xuất trùng tồn. | Hai hay nhiều yêu cầu xuất cùng vật tư được xử lý đồng thời. | Việc kiểm tra và trừ tồn phải nguyên tử/tuần tự hóa ở mức lưu trữ. Chỉ yêu cầu đủ tồn theo thứ tự commit được thành công; yêu cầu không còn đủ tồn nhận `409 INSUFFICIENT_STOCK`. | AC-STK-06 |
| BR-013 | Yêu cầu ghi dữ liệu lặp lại không được tạo tác động lặp trong 24 giờ. | Cùng người dùng, endpoint và `Idempotency-Key` được gửi trong 24 giờ kể từ khi request được ghi nhận thành công. | Cùng payload: phát lại status/body đã lưu, không tạo tác động lặp. Payload khác: trả `409 IDEMPOTENCY_KEY_REUSED`. Request đồng thời cùng key/payload chỉ tạo tối đa một vật tư và các request còn lại nhận kết quả tương đương; cùng key nhưng payload khác chỉ một payload được chấp nhận. Sau 24 giờ, key được coi như request mới. Persistence phải bền vững và an toàn qua nhiều instance. | AC-IDEM-01–AC-IDEM-06 |
| BR-014 | Mọi API thay đổi dữ liệu yêu cầu đăng nhập. | Gọi `POST /api/materials`, `POST /api/stock-receipts` hoặc `POST /api/stock-issues` khi chưa xác thực hoặc không có auth context hợp lệ. | Trả `401 AUTHENTICATION_REQUIRED`; không ghi dữ liệu. Auth context chỉ được thiết lập sau khi middleware xác thực đáng tin cậy xác minh danh tính. | AC-AUTH-01 |
| BR-015 | Chỉ người có capability được máy chủ xác minh mới được phép thực hiện thao tác. | Người dùng đã xác thực nhưng thiếu capability tương ứng. | Trả `403 FORBIDDEN`; không ghi dữ liệu. Tạo vật tư yêu cầu capability `materials:create`; capability trong auth context phải được cấp/xác minh phía server. | AC-AUTH-02 |
| BR-016 | Danh tính và quyền lấy từ auth context phía server. | Client gửi `userId`, `permissions`, vai trò hoặc quyền trong body/header tùy ý. | Chỉ dùng `request.auth.userId` và `request.auth.permissions` được middleware xác thực đáng tin cậy thiết lập sau khi xác minh danh tính/quyền; không dùng dữ liệu client gửi để xác định người gọi hoặc cấp quyền. | AC-AUTH-03 |
| BR-017 | Request sai cấu trúc/kiểu dữ liệu không được ghi nhận. | Thiếu trường bắt buộc, trường sai kiểu, số lượng không phải số hữu hạn hoặc số lượng không dương. | Trả lỗi validation theo envelope thống nhất; không tạo bản ghi và không đổi tồn. | AC-MAT-04, AC-STK-01, AC-STK-03 |
| BR-018 | Cập nhật phiếu và tồn phải có tính nguyên tử. | Lỗi cơ sở dữ liệu xảy ra giữa lúc lưu phiếu và cập nhật tồn. | Rollback toàn bộ transaction; không có phiếu dở dang hoặc thay đổi tồn một phần; trả lỗi máy chủ. | AC-STK-08 |

### Schema vật tư đã xác nhận

| Bảng/cột | Kiểu và quy tắc |
|---|---|
| Bảng | `materials`, InnoDB, charset `utf8mb4`. |
| `material_id` | `BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY`; API ánh xạ sang chuỗi `mat_<id>`. |
| `code` | `VARCHAR(50) NOT NULL`; trim, gộp khoảng trắng liên tiếp, chuyển uppercase trước khi lưu; collation `utf8mb4_0900_as_cs`; unique index trên giá trị chuẩn hóa. |
| `name` | `VARCHAR(255) NOT NULL`; trim và gộp khoảng trắng liên tiếp theo quy tắc chuẩn hóa tên/đơn vị. |
| `unit` | `VARCHAR(30) NOT NULL`; trim và gộp khoảng trắng liên tiếp theo quy tắc chuẩn hóa tên/đơn vị. |
| `stock_quantity` | `BIGINT UNSIGNED NOT NULL DEFAULT 0`; luôn khởi tạo bằng 0 khi tạo vật tư. |

Client không được truyền `stockQuantity` hoặc trường tồn kho tương đương trong request tạo vật tư. ID `BIGINT UNSIGNED` phải được trả dưới dạng chuỗi `mat_<id>`; nếu một API nhận ID này, chỉ chấp nhận `mat_<số nguyên dương>` nằm trong giới hạn kiểu dữ liệu trước khi truy vấn.

### Persistence idempotency

Kết quả request thành công phải được lưu bền vững trong database, cùng phạm vi theo danh tính người dùng, endpoint và key. Bản ghi cần đủ thông tin để so sánh payload đã chuẩn hóa, phát lại status/response, và xác định thời điểm hết hạn 24 giờ. Ràng buộc duy nhất ở database và transaction phải bảo đảm xử lý đồng thời giữa nhiều backend instance theo BR-013. Không dùng bộ nhớ tiến trình làm nguồn persistence.

## 3. API contract

### 3.1 Quy ước chung

- Base path: `/api`.
- JSON UTF-8. Request body phải là JSON object đúng cấu trúc được nêu dưới đây.
- Mọi response dùng cùng envelope:

  ```json
  {
    "success": true,
    "data": {},
    "error": null
  }
  ```

  Khi thất bại:

  ```json
  {
    "success": false,
    "data": null,
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Request không hợp lệ.",
      "fields": {
        "name": "Không được để trống."
      }
    }
  }
  ```

- `error.fields` chỉ có khi lỗi gắn với trường; nếu không áp dụng thì bỏ trường này. `message` là thông báo có thể hiển thị/ghi log, không được chứa bí mật hay chi tiết nội bộ database.
- HTTP status là nguồn xác định thành công/thất bại; `success` phải nhất quán với status.
- Các request ghi dữ liệu bắt buộc có header `Idempotency-Key` không rỗng. Khóa được giới hạn phạm vi theo danh tính đã xác thực và endpoint; hiệu lực 24 giờ kể từ khi request được ghi nhận thành công. Persistence phải bền vững, lưu đủ payload hash và response để phát lại, an toàn khi có request đồng thời và dùng được qua nhiều backend instance. Chỉ lưu kết quả tạo thành công; lỗi validation/authorization không tạo vật tư hoặc idempotency record.
- Không chấp nhận `userId`, `role`, `permissions` hoặc `stockQuantity` trong body tạo vật tư để quyết định danh tính, quyền hoặc tồn đầu kỳ.
- Lỗi database/transaction trả `500 INTERNAL_ERROR` với thông báo chung; không trả thông tin nhạy cảm. Tồn và phiếu phải rollback theo BR-008/BR-018.
- Mã lỗi tối thiểu: `AUTHENTICATION_REQUIRED`, `FORBIDDEN`, `VALIDATION_ERROR`, `MATERIAL_CODE_DUPLICATE`, `MATERIAL_NOT_FOUND`, `INSUFFICIENT_STOCK`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_REUSED`, `INTERNAL_ERROR`.

### 3.2 `GET /api/materials`

- **Mục đích:** Lấy danh sách vật tư và tồn kho hiện tại.
- **Authentication/authorization:** Chính sách xác thực cho đọc danh sách chưa được quy định; xem SPEC GAP. Không được mặc định endpoint là công khai.
- **Query parameters:** Không bắt buộc. MVP không yêu cầu tìm kiếm, lọc hoặc phân trang.
- **Validation:** Không có body. Nếu có query không hỗ trợ, trả `400 VALIDATION_ERROR` thay vì âm thầm diễn giải.
- **Thành công:** `200 OK`.

  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "materialId": "mat_123",
          "code": "NPK 16-16-8",
          "name": "Phân NPK",
          "unit": "bao",
          "stockQuantity": 12
        }
      ]
    },
    "error": null
  }
  ```

- Danh sách chưa có dữ liệu trả `200` với `"items": []`; lỗi tải dữ liệu trả envelope thất bại, không được biểu diễn thành danh sách rỗng.
- **Lỗi:** `400 VALIDATION_ERROR`; `401 AUTHENTICATION_REQUIRED` nếu chính sách đọc yêu cầu đăng nhập; `500 INTERNAL_ERROR`.
- **Rule/edge case:** BR-001, BR-005, BR-016. Tồn phản ánh giá trị đã commit, không trả dữ liệu chưa commit.

### 3.3 `POST /api/materials`

- **Mục đích:** Tạo vật tư mới.
- **Authentication/authorization:** Bắt buộc auth context hợp lệ với `request.auth.userId` và `request.auth.permissions` do middleware xác thực đáng tin cậy thiết lập sau khi xác minh danh tính phía server. Yêu cầu capability `materials:create`; không nhận danh tính/quyền từ client.
- **Header:** `Idempotency-Key` bắt buộc.
- **Request body:**

  ```json
  {
    "code": "NPK 16-16-8",
    "name": "Phân NPK",
    "unit": "bao"
  }
  ```

- **Validation:** `code`, `name`, `unit` phải là chuỗi không rỗng sau chuẩn hóa; sau chuẩn hóa lần lượt không dài quá 50, 255 và 30 ký tự theo schema đã xác nhận. Kiểm tra độ dài trước khi truy cập/ghi database; vượt giới hạn trả `422 VALIDATION_ERROR` kèm lỗi theo trường. Thiếu trường bắt buộc hoặc giá trị rỗng/chỉ có khoảng trắng cũng trả `422 VALIDATION_ERROR` kèm lỗi theo trường. Từ chối `stockQuantity` và các trường danh tính/quyền không thuộc request bằng `400 VALIDATION_ERROR`.
- **Thành công:** `201 Created`; `data` chứa vật tư mới với `stockQuantity: 0`. Tồn ban đầu do hệ thống mặc định bằng 0; client không thể thiết lập tồn trong request tạo.
- **Response data:**

  ```json
  {
    "materialId": "mat_123",
    "code": "NPK 16-16-8",
    "name": "Phân NPK",
    "unit": "bao",
    "stockQuantity": 0
  }
  ```
- **Lỗi:** `400 VALIDATION_ERROR` cho body/request sai cấu trúc hoặc có trường không được phép; `422 VALIDATION_ERROR` cho trường bắt buộc thiếu/rỗng/chỉ có khoảng trắng hoặc vượt giới hạn độ dài schema; `400 IDEMPOTENCY_KEY_REQUIRED`; `401 AUTHENTICATION_REQUIRED`; `403 FORBIDDEN`; `409 MATERIAL_CODE_DUPLICATE` hoặc `IDEMPOTENCY_KEY_REUSED`; `500 INTERNAL_ERROR`.
- **Rule/edge case:** BR-001–BR-005, BR-013–BR-018. Mã chỉ khác khoảng trắng hoặc chữ hoa/thường nhưng có cùng giá trị chuẩn hóa phải bị coi là trùng.

### 3.4 `POST /api/stock-receipts`

- **Mục đích:** Ghi một phiếu nhập và tăng tồn.
- **Authentication/authorization:** Bắt buộc đăng nhập; chỉ quyền/role được xác nhận mới được nhập kho.
- **Header:** `Idempotency-Key` bắt buộc.
- **Request body:**

  ```json
  {
    "materialId": "mat_123",
    "quantity": 5
  }
  ```

- **Validation:** `materialId` là chuỗi định danh không rỗng; `quantity` là số JSON hữu hạn lớn hơn 0. Không nhận `stockQuantityAfter`, `userId` hoặc role từ client.
- **Thành công:** `201 Created`; phiếu và tồn được commit cùng transaction.

  ```json
  {
    "success": true,
    "data": {
      "receiptId": "rec_456",
      "materialId": "mat_123",
      "quantity": 5,
      "stockQuantityAfter": 17
    },
    "error": null
  }
  ```

- **Lỗi:** `400 VALIDATION_ERROR` hoặc `IDEMPOTENCY_KEY_REQUIRED`; `401 AUTHENTICATION_REQUIRED`; `403 FORBIDDEN`; `404 MATERIAL_NOT_FOUND`; `409 IDEMPOTENCY_KEY_REUSED`; `422 VALIDATION_ERROR`; `500 INTERNAL_ERROR`.
- **Rule/edge case:** BR-006–BR-008, BR-013–BR-018. Gửi lại cùng key/payload phát lại response ban đầu, không cộng tồn lần hai. Lỗi giữa chừng không được để lại phiếu hoặc tồn cập nhật một phần.

### 3.5 `POST /api/stock-issues`

- **Mục đích:** Ghi một phiếu xuất và giảm tồn.
- **Authentication/authorization:** Bắt buộc đăng nhập; chỉ quyền/role được xác nhận mới được xuất kho.
- **Header:** `Idempotency-Key` bắt buộc.
- **Request body:**

  ```json
  {
    "materialId": "mat_123",
    "quantity": 3
  }
  ```

- **Validation:** `materialId` là chuỗi định danh không rỗng; `quantity` là số JSON hữu hạn lớn hơn 0. Không nhận `stockQuantityAfter`, `userId` hoặc role từ client.
- **Thành công:** `201 Created`; phiếu và tồn được commit cùng transaction.

  ```json
  {
    "success": true,
    "data": {
      "issueId": "iss_789",
      "materialId": "mat_123",
      "quantity": 3,
      "stockQuantityAfter": 9
    },
    "error": null
  }
  ```

- **Lỗi:** `400 VALIDATION_ERROR` hoặc `IDEMPOTENCY_KEY_REQUIRED`; `401 AUTHENTICATION_REQUIRED`; `403 FORBIDDEN`; `404 MATERIAL_NOT_FOUND`; `409 INSUFFICIENT_STOCK` hoặc `IDEMPOTENCY_KEY_REUSED`; `422 VALIDATION_ERROR`; `500 INTERNAL_ERROR`.
- **Rule/edge case:** BR-009–BR-018. Không đủ tồn tại thời điểm cập nhật trả `409`; yêu cầu đồng thời phải kiểm tra và giảm tồn nguyên tử; không thể làm tồn âm.

## 4. Yêu cầu giao diện

### 4.1 Màn hình danh sách vật tư

Màn hình hiển thị tối thiểu mã, tên, đơn vị tính và số lượng tồn kho. Trạng thái phải loại trừ lẫn nhau:

| Trạng thái | Điều kiện | Hiển thị/hành vi |
|---|---|---|
| `Loading` | Đang chờ tải danh sách. | Hiển thị chỉ báo đang tải; chưa hiển thị trạng thái rỗng. |
| `Empty` | API tải thành công và `items` rỗng. | Thông báo chưa có vật tư; có thể cung cấp đường dẫn/nút tạo vật tư nếu người dùng có quyền. |
| `Error` | Request thất bại, kể cả lỗi mạng, 401/403 hoặc lỗi máy chủ. | Hiển thị lỗi phù hợp và thao tác thử lại; không chuyển lỗi thành danh sách rỗng. |
| `Success` | API tải thành công và có ít nhất một vật tư. | Hiển thị danh sách cùng tồn kho hiện tại. |

### 4.2 Form tạo vật tư

Form có các trường mã, tên, đơn vị tính; không cho nhập tồn ban đầu. Hệ thống khởi tạo tồn bằng 0 theo BR-001 và BR-005.

- **Đang gửi:** Hiển thị trạng thái gửi, ngăn gửi lặp từ thao tác nhanh và ngăn sửa nội dung cho đến khi request kết thúc. Khóa idempotency được giữ nguyên khi retry cùng thao tác.
- **Validation theo trường:** Hiển thị lỗi cạnh trường tương ứng cho giá trị thiếu/rỗng/chỉ khoảng trắng; giữ các giá trị đã nhập để sửa. Chuẩn hóa khoảng trắng nhất quán với server.
- **Tạo thành công:** Thông báo thành công và hiển thị vật tư vừa tạo trong danh sách hoặc điều hướng về danh sách đã cập nhật.
- **Mã trùng:** Hiển thị lỗi gắn với trường mã, giữ lại dữ liệu form để người dùng sửa; không giả lập thành công.
- **Chưa đăng nhập/không đủ quyền:** Với `401`, yêu cầu đăng nhập theo luồng xác thực của ứng dụng; với `403`, thông báo không đủ quyền. Không xóa dữ liệu form trừ khi hành vi đó được quy định ở luồng xác thực riêng.
- **Lỗi khác:** Hiển thị thông báo thất bại có thể thử lại; không hiển thị trạng thái thành công. Lỗi API không được coi là danh sách rỗng.

## 5. Edge cases

| Tình huống | Quy tắc đã xác định | Kết quả cần kiểm tra |
|---|---|---|
| Trường văn bản rỗng hoặc chỉ chứa khoảng trắng | Tên/đơn vị/mã bắt buộc phải có giá trị sau chuẩn hóa; khoảng trắng được chuẩn hóa theo mục 1. | Từ chối trường rỗng sau chuẩn hóa; lỗi theo trường, không ghi dữ liệu. |
| Người dùng chưa đăng nhập | Các API thay đổi dữ liệu yêu cầu đăng nhập (BR-014). | `401 AUTHENTICATION_REQUIRED`; tồn và dữ liệu không đổi. |
| Người dùng đã đăng nhập nhưng thiếu quyền | Quyền tạo/nhập/xuất cần ma trận được xác nhận (BR-015). | Sau khi ma trận được chốt, `403 FORBIDDEN` cho quyền không đạt; không ghi dữ liệu. |
| Mã trùng sau chuẩn hóa | So sánh mã đã trim, gộp whitespace và uppercase (BR-002/003). | `409 MATERIAL_CODE_DUPLICATE`; không tạo bản ghi thứ hai. |
| Vật tư không tồn tại | `materialId` không tìm thấy trong thao tác nhập/xuất. | `404 MATERIAL_NOT_FOUND`; không tạo phiếu, tồn không đổi. |
| Số lượng bằng 0 hoặc âm | Số lượng giao dịch phải lớn hơn 0. | Validation thất bại, không thay đổi tồn. |
| Số lượng sai kiểu, chuỗi, null, NaN hoặc vô hạn | Chỉ chấp nhận số JSON hữu hạn. | `422 VALIDATION_ERROR`; không tạo phiếu, tồn không đổi. |
| Số lượng có phần thập phân hoặc vượt giới hạn độ chính xác | Quy tắc precision chưa chốt. | Không tự làm tròn; xử lý theo quyết định SPEC GAP trước khi triển khai. |
| Xuất lớn hơn tồn | Không cho xuất vượt tồn (BR-010). | `409 INSUFFICIENT_STOCK`; không tạo phiếu, tồn không đổi. |
| Gửi request lặp lại cùng key và payload | Phát lại kết quả lần đầu (BR-013). | Cùng status/body, chỉ một tác động dữ liệu. |
| Tái sử dụng key với payload khác | Không chấp nhận. | `409 IDEMPOTENCY_KEY_REUSED`; không phát sinh tác động lần hai. |
| Request ghi dữ liệu thiếu `Idempotency-Key` | Header bắt buộc theo đề xuất MVP. | `400 IDEMPOTENCY_KEY_REQUIRED`; không ghi dữ liệu. |
| Hai thao tác cập nhật tồn đồng thời | Cập nhật phải nguyên tử; xuất không được tiêu thụ cùng một lượng tồn hai lần (BR-012). | Với tồn ban đầu 10 và hai phiếu xuất đồng thời mỗi phiếu 7, chỉ một thành công; phiếu còn lại `409`, tồn cuối là 3. |
| Database lỗi giữa chừng | Giao dịch phiếu và cập nhật tồn phải rollback toàn bộ (BR-008/018). | `500 INTERNAL_ERROR`; không có phiếu dở dang, tồn giữ nguyên. |
| API danh sách lỗi | Error không tương đương danh sách rỗng. | Giao diện ở `Error`, có thử lại; không hiển thị `Empty`. |

## 6. Yêu cầu dữ liệu và tính nhất quán

- Mã chuẩn hóa có ràng buộc duy nhất ở mức lưu trữ để ngăn hai request đồng thời tạo mã trùng.
- Giao dịch nhập/xuất, bản ghi phiếu và thay đổi tồn phải được ghi trong một transaction.
- Kiểm tra đủ tồn và trừ tồn phải là một thao tác nguyên tử hoặc cơ chế tương đương bảo đảm BR-012 dưới tải đồng thời; chỉ kiểm tra tồn ở tầng giao diện là không đủ.
- Mọi đường lỗi trước commit và mọi rollback phải giữ nguyên tồn trước giao dịch.
- Không cho phép client cập nhật trực tiếp `stockQuantity` qua API trong phạm vi MVP.
- Không quy định xóa vật tư, chỉnh sửa danh mục, hoặc xóa/điều chỉnh phiếu trong MVP.

## 7. Ngoài phạm vi MVP

- Thanh toán, công nợ và hóa đơn điện tử.
- Quản lý nhà cung cấp hoặc quy trình mua hàng.
- Dự báo mùa vụ, đề xuất nhu cầu, hoặc báo cáo phân tích nâng cao.
- Tích hợp cân điện tử, IoT hoặc thiết bị kho.
- Đồng bộ dữ liệu với hệ thống bên ngoài.
- Tìm kiếm/lọc/phân trang nâng cao, xuất báo cáo.
- Lịch sử phiếu qua API/màn hình truy vấn riêng, chỉnh sửa hoặc hủy phiếu.
- Phân hệ người dùng, đăng ký tài khoản, quản trị vai trò hoặc tự đặt chính sách phân quyền; cơ chế xác thực/phân quyền hiện có của ứng dụng cần được xác nhận để tích hợp.

## 8. Tiêu chí nghiệm thu

Các test dưới đây dùng auth context giả lập trong unit test khi phù hợp; điều này không chứng minh xác thực JWT/permissions provider thực tế đã được tích hợp. Test lỗi cơ sở dữ liệu có thể dùng môi trường kiểm thử/fault injection, không áp dụng cho production.

### Vật tư

- **AC-MAT-01 — Tạo vật tư và tồn ban đầu:** Given người dùng đã đăng nhập và auth context phía server có capability `materials:create`, When gửi mã, tên, đơn vị hợp lệ, Then nhận `201`, có `materialId`, `stockQuantity` bằng 0; danh sách hiển thị vật tư mới.
- **AC-MAT-02 — Chuẩn hóa khoảng trắng và chữ hoa:** Given mã/tên/đơn vị có khoảng trắng đầu/cuối và khoảng trắng liên tiếp, và mã có chữ thường, When tạo vật tư, Then mã được trim, gộp khoảng trắng, chuyển uppercase; tên/đơn vị được trim và gộp khoảng trắng theo mục 1.
- **AC-MAT-03 — Trùng mã chuẩn hóa:** Given đã tồn tại mã `NPK 16-16-8`, When tạo ` NPK   16-16-8 `, Then nhận `409 MATERIAL_CODE_DUPLICATE`, không tạo bản ghi thứ hai và tồn không đổi.
- **AC-MAT-04 — Trường bắt buộc:** Given `code`, `name` hoặc `unit` bị thiếu/rỗng/chỉ khoảng trắng, When gửi request, Then nhận `422 VALIDATION_ERROR` có `fields` phù hợp và không tạo vật tư.
- **AC-MAT-05 — Không nhận tồn từ client:** Given body tạo vật tư có `stockQuantity` âm hoặc dương, When gửi request, Then nhận `400 VALIDATION_ERROR`; không tạo vật tư và không thay đổi tồn.
- **AC-MAT-06 — Giới hạn độ dài schema:** Given mã dài hơn 50, tên dài hơn 255 hoặc đơn vị dài hơn 30 ký tự sau chuẩn hóa, When gửi request, Then trước khi truy cập/ghi database nhận `422 VALIDATION_ERROR` theo trường và không tạo vật tư; giá trị đúng giới hạn được chấp nhận.

### Nhập/xuất và tồn kho

- **AC-STK-01 — Kiểu và giới hạn số lượng:** Given một request nhập/xuất có quantity bằng 0, âm, null, chuỗi hoặc số không hữu hạn, When gửi request, Then nhận `422 VALIDATION_ERROR`, không tạo phiếu và tồn không đổi.
- **AC-STK-02 — Nhập thành công:** Given vật tư có tồn 12, When nhập 5 thành công, Then nhận `201`, phiếu có quantity 5, tồn trả về và tồn trong danh sách bằng 17.
- **AC-STK-03 — Vật tư không tồn tại/validation thất bại:** Given `materialId` không tồn tại hoặc body sai, When nhập/xuất, Then nhận lần lượt `404 MATERIAL_NOT_FOUND` hoặc lỗi validation; không có phiếu và tồn không đổi.
- **AC-STK-04 — Xuất vượt tồn:** Given tồn là 4, When xuất 5, Then nhận `409 INSUFFICIENT_STOCK`, không có phiếu và tồn vẫn là 4.
- **AC-STK-05 — Xuất thành công:** Given tồn là 12, When xuất 3, Then nhận `201`, phiếu có quantity 3, tồn sau giao dịch bằng 9 và không âm.
- **AC-STK-06 — Xuất đồng thời:** Given tồn ban đầu là 10, When hai request xuất 7 cho cùng vật tư chạy đồng thời, Then đúng một request thành công, request còn lại nhận `409 INSUFFICIENT_STOCK`, chỉ có một phiếu được commit và tồn cuối bằng 3.
- **AC-STK-07 — Ranh giới bằng tồn:** Given tồn là 5, When xuất đúng 5, Then giao dịch thành công và tồn bằng 0; mọi lần xuất tiếp theo với quantity lớn hơn 0 bị từ chối.
- **AC-STK-08 — Rollback lỗi database:** Given transaction nhập hoặc xuất gặp lỗi database sau khi bắt đầu ghi phiếu nhưng trước commit, When request kết thúc, Then nhận `500 INTERNAL_ERROR`, không có phiếu được commit và tồn giữ nguyên giá trị trước request.

### Lặp request và truy cập

- **AC-IDEM-01 — Phát lại request:** Given một request hợp lệ với `Idempotency-Key: k1` đã thành công, When trong 24 giờ gửi lại cùng key, cùng người dùng, endpoint và payload, Then response status/body được phát lại, chỉ có một vật tư/phiếu và tồn chỉ thay đổi một lần.
- **AC-IDEM-02 — Key bị tái sử dụng sai payload:** Given key `k1` đã dùng cho một payload, When cùng người dùng và endpoint gửi payload khác với `k1`, Then nhận `409 IDEMPOTENCY_KEY_REUSED` và không phát sinh bản ghi hay thay đổi tồn mới.
- **AC-IDEM-03 — Thiếu idempotency key:** Given request ghi dữ liệu không có `Idempotency-Key`, When gửi request, Then nhận `400 IDEMPOTENCY_KEY_REQUIRED` và không ghi dữ liệu.
- **AC-IDEM-04 — Key hết hạn:** Given request với key `k1` đã thành công và đã quá 24 giờ, When gửi request hợp lệ mới với key đó, Then xử lý như request mới; nếu mã vật tư mới hợp lệ thì tạo thêm một vật tư.
- **AC-IDEM-05 — Cùng key/payload đồng thời:** Given chưa có hiệu lực key `k1`, When hai request đồng thời cùng người dùng, endpoint, key và payload được gửi, Then chỉ tạo một vật tư và cả hai nhận kết quả tương đương của lần tạo thành công.
- **AC-IDEM-06 — Cùng key/payload khác đồng thời:** Given chưa có hiệu lực key `k1`, When hai request đồng thời cùng người dùng và endpoint nhưng payload khác nhau được gửi, Then chỉ một payload được chấp nhận, chỉ một vật tư được tạo và request còn lại nhận `409 IDEMPOTENCY_KEY_REUSED`.
- **AC-AUTH-01 — Chưa đăng nhập:** Given không có thông tin xác thực hợp lệ, When gọi từng API POST ghi dữ liệu, Then nhận `401 AUTHENTICATION_REQUIRED`, envelope thất bại thống nhất và dữ liệu/tồn không đổi.
- **AC-AUTH-02 — Không đủ quyền:** Given auth context đã được thiết lập phía server nhưng thiếu capability `materials:create`, When tạo vật tư, Then nhận `403 FORBIDDEN` và không ghi dữ liệu.
- **AC-AUTH-03 — Không tin dữ liệu client:** Given người gọi đã xác thực nhưng body/header chứa `userId`, `permissions` hoặc role giả mạo, When gửi request, Then quyết định truy cập dựa trên auth context phía server; giá trị giả mạo không cấp quyền hoặc thay đổi người sở hữu phiếu.

### Danh sách và giao diện

- **AC-UI-01 — Bốn trạng thái danh sách:** Given request đang chạy, trả danh sách rỗng thành công, thất bại, hoặc trả ít nhất một vật tư, When hiển thị màn hình, Then lần lượt hiển thị `Loading`, `Empty`, `Error` có nút thử lại, hoặc `Success` có danh sách.
- **AC-UI-02 — Lỗi không phải danh sách rỗng:** Given API danh sách trả lỗi hoặc mất kết nối, When request kết thúc, Then hiển thị `Error`, không hiển thị thông báo chưa có vật tư và thao tác thử lại gửi request mới.
- **AC-UI-03 — Form gửi và validation:** Given form thiếu trường bắt buộc, When gửi, Then lỗi hiển thị đúng trường và không phát sinh API thành công; Given request hợp lệ đang gửi, Then hiển thị trạng thái đang gửi và ngăn thao tác gửi lặp.
- **AC-UI-04 — Kết quả tạo vật tư:** Given API tạo trả thành công, mã trùng, `401`, `403` hoặc lỗi máy chủ, When form xử lý response, Then lần lượt hiển thị thành công, lỗi tại trường mã, yêu cầu đăng nhập, thông báo không đủ quyền, hoặc thông báo lỗi có thể thử lại; không trường hợp lỗi nào bị hiển thị như thành công.

## 9. Mã lỗi và phản hồi

| HTTP status | Mã lỗi | Ý nghĩa |
|---|---|---|
| `400` | `VALIDATION_ERROR` | JSON/request không đúng cấu trúc hoặc chứa trường không được hỗ trợ, ví dụ `stockQuantity`, `userId`, role hoặc permissions trong request tạo vật tư. |
| `400` | `IDEMPOTENCY_KEY_REQUIRED` | Thiếu header bắt buộc cho request ghi dữ liệu. |
| `401` | `AUTHENTICATION_REQUIRED` | Chưa xác thực hoặc thông tin xác thực không hợp lệ. |
| `403` | `FORBIDDEN` | Đã xác thực nhưng không có quyền đã cấu hình. |
| `404` | `MATERIAL_NOT_FOUND` | Không tìm thấy vật tư theo `materialId`. |
| `409` | `MATERIAL_CODE_DUPLICATE` | Mã chuẩn hóa đã tồn tại. |
| `409` | `INSUFFICIENT_STOCK` | Số lượng xuất vượt tồn khả dụng tại thời điểm commit. |
| `409` | `IDEMPOTENCY_KEY_REUSED` | Key đã dùng cho payload khác trong cùng phạm vi. |
| `422` | `VALIDATION_ERROR` | Trường bắt buộc của `POST /api/materials` bị thiếu/rỗng/chỉ có khoảng trắng hoặc vượt độ dài schema; hoặc giá trị nghiệp vụ không hợp lệ theo endpoint, ví dụ quantity giao dịch không lớn hơn 0. |
| `500` | `INTERNAL_ERROR` | Lỗi nội bộ/database; không để lộ chi tiết triển khai. |

## 10. Định nghĩa hoàn thành MVP

MVP được nghiệm thu khi:

1. Bốn endpoint ở mục 3 đáp ứng contract và envelope thống nhất.
2. Mọi rule BR-001 đến BR-018 có test tương ứng; test nghiệp vụ cốt lõi tại mục 8 đều đạt.
3. Nhập/xuất bảo đảm tính đúng tồn, không âm, xử lý nguyên tử dưới đồng thời và rollback khi lỗi.
4. Request lặp được xử lý idempotent theo chính sách đã chốt; không tạo tác động lặp.
5. Màn hình danh sách và form tạo vật tư thực hiện các trạng thái/hành vi tại mục 4.
6. Không triển khai chức năng nằm trong mục Ngoài phạm vi.
7. Các SPEC GAP ảnh hưởng đến quyền, xác thực và quy tắc dữ liệu được người dùng quyết định trước khi triển khai phần liên quan; đề xuất chưa được coi là yêu cầu đã phê duyệt.

## 11. SPEC GAP cần người dùng xác nhận

Các nội dung dưới đây chưa phải yêu cầu đã được phê duyệt. Không tự suy diễn câu trả lời; cần chốt trước khi triển khai các phần liên quan.

| ID | Câu hỏi cần xác nhận | Đề xuất để người dùng cân nhắc | Phần bị ảnh hưởng |
|---|---|---|---|
| GAP-02 | Giá trị cấu hình JWT deployment (Authorization scheme, allowed algorithms, issuer, audience, secret/public key) và nguồn đáng tin cậy để tra cứu permissions là gì? | Dùng thư viện xác minh JWT; không hardcode giá trị hoặc tin claim permissions chưa được issuer thống nhất. Chưa có issuer, user store hay permissions provider; middleware xác thực thực tế và route production đang BLOCKED cho tới khi được tích hợp. | BR-014–BR-016; xác thực JWT; nguồn permissions; route production. |
| GAP-03 | `GET /api/materials` có bắt buộc đăng nhập không, và có hạn chế quyền xem danh sách/tồn không? | Chỉ cho người dùng đã xác thực và có quyền xem kho; cần xác nhận. | Contract GET, trạng thái 401/403 và giao diện. |
| GAP-05 | Đơn vị/giao dịch nhập xuất có cho phép quantity thập phân không, và nếu có thì precision/scale và quy tắc làm tròn là gì? | `stock_quantity` đã được xác nhận là `BIGINT UNSIGNED`; không làm tròn quantity giao dịch ngầm. Cần quyết định trước khi triển khai nhập/xuất nếu nghiệp vụ cần số lẻ. | BR-006–BR-012; lưu và tính toán tồn trong các lát cắt nhập/xuất. |
| GAP-07 | Có cần lưu người lập, thời điểm giao dịch hoặc ghi chú trên phiếu trong MVP không? | Tối thiểu ghi định danh phiếu, vật tư, số lượng; thông tin bổ sung chỉ thêm sau khi xác nhận. | Schema phiếu, audit và API response. |
| GAP-09 | Có cho phép xóa vật tư hoặc điều chỉnh tồn thủ công trong MVP không? | Không hỗ trợ; điều chỉnh tồn cần nghiệp vụ/loại phiếu riêng được phê duyệt. | Phạm vi chức năng và tính toàn vẹn tồn. |

**Quy tắc xử lý SPEC GAP:** Nếu quyết định của người dùng làm thay đổi rule, API hoặc tiêu chí nghiệm thu, cập nhật tài liệu này trước khi xem đó là yêu cầu chính thức. Đề xuất được nêu trong bảng chỉ là phương án chờ xác nhận, không phải phê duyệt ngầm.

## 12. 2 lỗi/thiếu sót
**Test defect:** Integration tests dùng mã vật tư chưa chuẩn hóa, không nhất quán với quy tắc trong Spec. Cách sửa là chỉnh test và cleanup.

**Missing test:** Chưa kiểm tra hai request đồng thời tạo mã vật tư trùng nhưng dùng idempotency key khác nhau. Cách sửa là bổ sung MySQL integration test.