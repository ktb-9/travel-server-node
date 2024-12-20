export interface PaymentData {
  category: string;
  description: string;
  group: number[];
  pay: number;
  price: number;
  tripId: number;
  date: string;
}
export interface Payment {
  paymentId: number;
  tripId: number;
  category: string;
  date: string;
  description: string;
  group: number[];
  pay: number;
  price: number;
}
