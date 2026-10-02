/**
 * @deprecated Store-specific order controller is deprecated.
 * All order logic is now handled in the unified `orderController.js` using the single `Order` model.
 * These exports are delegated to `orderController.js` to ensure backward compatibility without duplicate code.
 */
const {
  getStoreOrders,
  getOrderById: getStoreOrderById,
  updateOrderStatus: updateStoreOrderStatus,
  validateStoreCoupon,
  createOrder: createStoreOrder,
} = require("../orderController");

module.exports = {
  getStoreOrders,
  getStoreOrderById,
  updateStoreOrderStatus,
  validateStoreCoupon,
  createStoreOrder,
};
