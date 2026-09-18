/** An Item Code is metadata; package totals matter only once cargo has been allocated. */
export function shouldValidateContainerPackages(
  hasAllocatedPackages: boolean,
  purchaseQuantityChanged: boolean,
  containerAllocationChanged: boolean,
): boolean {
  return hasAllocatedPackages && (purchaseQuantityChanged || containerAllocationChanged);
}
