// Supabase 프로젝트의 URL과 공개용 publishable 키(또는 anon 키)를 넣으세요.
// service_role 키나 secret 키는 브라우저에서 사용하면 안 됩니다.
const SUPABASE_URL = 'https://tfeywxxfatfxkcqnkpkq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmZXl3eHhmYXRmeGtjcW5rcGtxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0MjQ1MzIsImV4cCI6MjEwNzAwMDUzMn0.TmRm13LYUOaK3wbFV1vpTtPVSV-r04_UsC9pTDX5Jco';

// 처음 저장할 때 클라이언트를 만듭니다. 설정 전에도 금액 계산과 탭은 동작합니다.
let supabaseClient = null;
let isSaving = false;

// index.html에서 정한 id로 필요한 요소를 찾습니다.
// HTML에서 defer로 연결했으므로 HTML이 준비된 뒤 이 코드가 실행됩니다.
const orderForm = document.getElementById('order-form');
const customerName = document.getElementById('customer-name');
const customerPhone = document.getElementById('customer-phone');
const submitButton = orderForm.querySelector('button[type="submit"]');
const drinkSelect = document.getElementById('drink');
const quantityInput = document.getElementById('quantity');
const estimatedTotal = document.getElementById('estimated-total');
const orderConfirmation = document.getElementById('order-confirmation');
const requestsInput = document.getElementById('requests');
const orderTab = document.getElementById('order-tab');
const historyTab = document.getElementById('history-tab');
const orderPanel = document.getElementById('order-panel');
const historyPanel = document.getElementById('history-panel');
const ordersList = document.getElementById('orders-list');
const emptyOrders = document.getElementById('empty-orders');
const orderCount = document.getElementById('order-count');
const ordersTotal = document.getElementById('orders-total');
const clearOrdersButton = document.getElementById('clear-orders');

// 저장에 성공한 주문을 현재 화면의 배열에도 보관합니다.
// 이 배열과 화면용 번호는 새로고침하면 초기화되지만 Supabase의 데이터는 남습니다.
// 기존 내역 보기와 취소는 이 배열에만 적용됩니다. DB 조회/삭제는 별도 연결이 필요합니다.
const orders = [];
let nextOrderNumber = 1;

// hidden 클래스로 화면을 전환하므로 입력한 주문서는 그대로 유지됩니다.
function switchTab(showHistory) {
  orderPanel.classList.toggle('hidden', showHistory);
  historyPanel.classList.toggle('hidden', !showHistory);
  orderTab.setAttribute('aria-selected', String(!showHistory));
  historyTab.setAttribute('aria-selected', String(showHistory));
  orderTab.tabIndex = showHistory ? -1 : 0;
  historyTab.tabIndex = showHistory ? 0 : -1;
}

orderTab.addEventListener('click', function () { switchTab(false); });
historyTab.addEventListener('click', function () { switchTab(true); });

// 키보드의 좌우 화살표와 Home/End 키로도 탭을 선택할 수 있습니다.
[orderTab, historyTab].forEach(function (tab, index) {
  tab.addEventListener('keydown', function (event) {
    let targetIndex;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      targetIndex = 1 - index;
    } else if (event.key === 'Home') {
      targetIndex = 0;
    } else if (event.key === 'End') {
      targetIndex = 1;
    } else {
      return;
    }
    event.preventDefault();
    switchTab(targetIndex === 1);
    [orderTab, historyTab][targetIndex].focus();
  });
});

// 주문 목록, 건수 배지, 합계는 항상 이 함수에서 함께 갱신합니다.
function renderOrders() {
  // 기존 카드만 비우고 현재 배열을 기준으로 다시 만듭니다.
  ordersList.replaceChildren();
  emptyOrders.classList.toggle('hidden', orders.length > 0);
  orderCount.textContent = orders.length.toLocaleString('ko-KR');
  clearOrdersButton.disabled = orders.length === 0;
  let totalAmount = 0;

  orders.forEach(function (order) {
    totalAmount += order.amount;
    const card = document.createElement('li');
    card.className = 'order-card';

    const title = document.createElement('h3');
    title.textContent = `#${order.number} ${order.name}님 · ${order.amount.toLocaleString('ko-KR')}원`;

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'cancel-order';
    cancelButton.textContent = '취소';
    cancelButton.setAttribute('aria-label', `주문 #${order.number} 취소`);
    cancelButton.addEventListener('click', function () {
      if (!confirm(`#${order.number} 주문을 취소하시겠습니까?`)) return;

      // 화면의 위치가 아닌 고유한 주문번호로 삭제할 대상을 찾습니다.
      const index = orders.findIndex(function (item) {
        return item.number === order.number;
      });
      if (index === -1) return;
      orders.splice(index, 1);
      hideConfirmation();
      renderOrders();
      // 삭제된 버튼 대신 다음 취소 버튼 또는 탭으로 초점을 옮깁니다.
      const nextButton = ordersList.querySelectorAll('.cancel-order')[Math.min(index, orders.length - 1)];
      (nextButton || historyTab).focus();
    });

    const details = document.createElement('p');
    const optionsText = order.options.length ? ` (${order.options.join(', ')})` : '';
    details.textContent = `${order.drink} ${order.size}사이즈${optionsText} ${order.quantity}잔`;

    const meta = document.createElement('p');
    meta.className = 'order-meta';
    const timeText = order.orderedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    meta.textContent = `${order.requests ? `요청사항: ${order.requests} · ` : ''}${timeText}`;

    // 사용자 입력은 모두 textContent로 넣어 HTML로 실행되지 않게 합니다.
    card.append(title, cancelButton, details, meta);
    ordersList.append(card);
  });

  ordersTotal.textContent = `총 주문 금액: ${totalAmount.toLocaleString('ko-KR')}원 (${orders.length.toLocaleString('ko-KR')}건)`;
}

clearOrdersButton.addEventListener('click', function () {
  if (orders.length === 0 || !confirm('주문 내역을 모두 지우시겠습니까?')) return;
  // 배열만 비웁니다. 주문서 입력값과 다음 주문번호는 유지합니다.
  orders.length = 0;
  hideConfirmation();
  renderOrders();
  historyTab.focus();
});

// 금액 계산은 이 함수에서만 합니다.
// 화면에 예상 금액을 표시하고, 같은 금액을 주문 메시지에서도 쓰도록 반환합니다.
function calculateTotal() {
  let total = 0;
  const quantity = Number(quantityInput.value);

  // 음료를 고르지 않았다면 M 사이즈가 선택되어 있어도 합계는 0원입니다.
  // 수량을 지우거나 잘못 입력하는 중에도 NaN 또는 잘못된 금액이 나오지 않게 합니다.
  if (drinkSelect.value && Number.isInteger(quantity)
      && quantity >= Number(quantityInput.min)
      && quantity <= Number(quantityInput.max)) {
    const selectedDrink = drinkSelect.selectedOptions[0];
    const selectedSize = orderForm.querySelector('input[name="size"]:checked');
    const selectedOptions = orderForm.querySelectorAll('input[name="options"]:checked');

    // data-price는 문자열로 읽히므로 Number()로 숫자로 바꿔 더합니다.
    const drinkPrice = Number(selectedDrink.dataset.price);
    const sizePrice = selectedSize ? Number(selectedSize.dataset.price) : 0;
    let optionsPrice = 0;

    // 선택한 옵션을 하나씩 살펴보고 추가 가격을 모두 더합니다.
    selectedOptions.forEach(function (option) {
      optionsPrice += Number(option.dataset.price);
    });

    // 사이즈와 옵션의 추가 금액은 한 잔마다 적용합니다.
    total = (drinkPrice + sizePrice + optionsPrice) * quantity;
  }

  // toLocaleString('ko-KR')은 5000 같은 숫자를 '5,000'으로 표시합니다.
  estimatedTotal.textContent = `예상 금액: ${total.toLocaleString('ko-KR')}원`;
  return total;
}

// 이전 주문 메시지가 바뀐 입력 내용의 결과처럼 보이지 않게 숨깁니다.
function hideConfirmation() {
  orderConfirmation.classList.add('hidden');
  orderConfirmation.textContent = '';
}

// input은 수량을 타이핑하는 도중에도 발생합니다.
// change도 연결하여 드롭다운, 라디오, 체크박스 선택 변경을 처리합니다.
orderForm.addEventListener('input', function () {
  hideConfirmation();
  calculateTotal();
});

orderForm.addEventListener('change', function () {
  hideConfirmation();
  calculateTotal();
});

// 버튼 클릭뿐 아니라 Enter 키로 제출할 때도 같은 검사를 합니다.
orderForm.addEventListener('submit', async function (event) {
  // 기본 제출 동작인 페이지 새로고침을 막습니다.
  event.preventDefault();
  // 버튼 비활성화와 별도로 검사하여 Enter 키 등의 중복 제출도 막습니다.
  if (isSaving) return;
  hideConfirmation();

  // trim()으로 앞뒤 공백을 없애 공백만 입력한 이름도 검사합니다.
  const name = customerName.value.trim();
  if (!name) {
    alert('이름을 입력해주세요');
    customerName.focus();
    return;
  }

  if (!drinkSelect.value) {
    alert('음료를 선택해주세요');
    drinkSelect.focus();
    return;
  }

  // form에 novalidate가 있으므로 수량의 최소·최대 범위도 직접 확인합니다.
  const quantity = Number(quantityInput.value);
  if (!Number.isInteger(quantity)
      || quantity < Number(quantityInput.min)
      || quantity > Number(quantityInput.max)) {
    alert('수량은 1부터 15까지의 정수로 입력해주세요');
    quantityInput.focus();
    return;
  }

  const total = calculateTotal();
  const selectedDrink = drinkSelect.selectedOptions[0];
  const selectedSize = orderForm.querySelector('input[name="size"]:checked');
  const selectedOptions = orderForm.querySelectorAll('input[name="options"]:checked');

  // 메뉴 끝의 ' 4,000원' 부분만 제거해서 음료 이름을 얻습니다.
  // 이름을 별도로 나열하지 않아 HTML에서 메뉴를 추가해도 그대로 사용할 수 있습니다.
  const drinkName = selectedDrink.textContent.replace(/\s+[\d,]+원\s*$/, '').trim();
  const optionNames = Array.from(selectedOptions, function (option) {
    // labels[0]은 for/id로 해당 체크박스와 연결한 label입니다.
    // 끝의 ' +500원' 부분을 지우고 옵션 이름만 남깁니다.
    return option.labels[0].textContent.replace(/\s*\+[\d,]+원\s*$/, '').trim();
  });

  // 옵션이 있을 때만 공백과 괄호를 붙입니다.
  const optionsText = optionNames.length > 0 ? ` (${optionNames.join(', ')})` : '';

  // 속성 이름은 Supabase orders 테이블의 열 이름과 정확히 같아야 합니다.
  // options는 JSON 문자열로 바꾸지 않고 JavaScript 배열 그대로 보냅니다.
  const orderData = {
    customer_name: name,
    phone: customerPhone.value.trim() || null,
    drink: drinkName,
    drink_price: Number(selectedDrink.dataset.price),
    size: selectedSize.value,
    options: optionNames,
    quantity: quantity,
    request: requestsInput.value.trim() || null,
    total_price: total
  };

  // 저장 중에는 버튼과 입력칸을 잠깐 잠급니다.
  // 요청을 기다리는 사이 다시 작성하거나 내용을 바꾸는 것도 방지합니다.
  isSaving = true;
  const buttonText = submitButton.textContent;
  const controls = Array.from(orderForm.elements, function (element) {
    return { element: element, wasDisabled: element.disabled };
  });
  controls.forEach(function (control) { control.element.disabled = true; });
  submitButton.textContent = '저장 중…';
  orderForm.setAttribute('aria-busy', 'true');

  try {
    if (!SUPABASE_URL.trim() || !SUPABASE_KEY.trim()) {
      throw new Error('script.js 맨 위에 SUPABASE_URL과 SUPABASE_KEY를 입력해주세요.');
    }
    if (!window.supabase) {
      throw new Error('Supabase 라이브러리를 불러오지 못했습니다. CDN 연결을 확인해주세요.');
    }
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    // await는 서버 응답을 기다립니다. error가 있으면 catch로 이동시킵니다.
    // SQL의 트리거가 options를 order_options에도 같은 트랜잭션으로 저장합니다.
    // select()를 붙이지 않으므로 다른 손님의 주문을 읽는 권한은 필요하지 않습니다.
    const { error } = await supabaseClient.from('orders').insert(orderData);
    if (error) throw error;
  } catch (error) {
    console.error('주문 저장 오류:', error);
    alert('주문 저장에 실패했어요');
    // 실패한 주문은 화면 내역에 추가하거나 접수 완료로 표시하지 않습니다.
    return;
  } finally {
    // 성공/실패에 상관없이 원래 상태로 돌려 다시 시도할 수 있게 합니다.
    isSaving = false;
    controls.forEach(function (control) { control.element.disabled = control.wasDisabled; });
    submitButton.textContent = buttonText;
    orderForm.setAttribute('aria-busy', 'false');
  }

  // 저장 성공이 확인된 뒤에만 최신 주문을 배열 맨 앞에 추가합니다.
  orders.unshift({
    number: nextOrderNumber++,
    name: orderData.customer_name,
    drink: orderData.drink,
    size: orderData.size,
    options: orderData.options,
    quantity: orderData.quantity,
    requests: orderData.request || '',
    amount: orderData.total_price,
    orderedAt: new Date()
  });
  renderOrders();

  // textContent를 사용하면 입력한 이름을 HTML 코드가 아닌 글자로 표시합니다.
  orderConfirmation.textContent = `${name}님, ${drinkName} ${orderData.size}사이즈${optionsText} ${quantity}잔, 총 ${total.toLocaleString('ko-KR')}원 주문이 접수되었습니다!`;
  orderConfirmation.classList.remove('hidden');
});

// 다시 작성 버튼의 기본 reset 동작이 HTML에 지정한 초기값을 복원합니다.
// 따라서 이름·전화번호·요청사항은 비워지고 M 사이즈, 수량 1로 돌아갑니다.
orderForm.addEventListener('reset', function () {
  hideConfirmation();

  // reset 이벤트 직후에는 아직 이전 입력값이 남아 있습니다.
  // 기본 초기화가 끝난 다음 계산하도록 다음 작업 순서로 미룹니다.
  setTimeout(function () {
    calculateTotal();
  }, 0);
});

// 처음 페이지가 열릴 때도 현재 선택 상태로 금액을 표시합니다.
calculateTotal();
renderOrders();
