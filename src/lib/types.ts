export type OrderLine = {
  plcbCode: string;
  name: string;
  bottles: number;
  unitPrice: number;
  grossPrice: number;
};

export type ParsedOrder = {
  orderNumber: string;
  orderDate: string;
  street: string;
  cityLine: string;
  totalBottles: number;
  taxableAmount: number;
  tax: number;
  freight: number;
  orderTotal: number;
  totalBoxes: number;
  lines: OrderLine[];
  warnings: string[];
};

export type BolDocument = {
  restaurantName: string;
  street: string;
  cityLine: string;
  orderNumber: string;
  orderDate: string;
  lines: OrderLine[];
  totalBottles: number;
  totalBoxes: number;
  taxableAmount: number;
  tax: number;
  freight: number;
  directDeliveryFee: number;
  total: number;
};
