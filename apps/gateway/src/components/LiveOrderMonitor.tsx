import React, { useEffect, useState } from 'react';
import { CanonicalOrder, OrderStatus } from '@pinaka-delivery-hub/canonical-model';

export const LiveOrderMonitor: React.FC = () => {
  const [orders, setOrders] = useState<CanonicalOrder[]>([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/v1/gateway/orders/stream');
    
    eventSource.onmessage = (event) => {
      const newOrder: CanonicalOrder = JSON.parse(event.data);
      setOrders((prev) => [newOrder, ...prev]);
    };

    return () => eventSource.close();
  }, []);

  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    await fetch(`/api/v1/gateway/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 
        'Content-Type': 'application/json',
        'x-correlation-id': crypto.randomUUID()
      },
      body: JSON.stringify({ status: newStatus }),
    });
  };

  return (
    <div className="p-6 bg-slate-900 text-white rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4">🔴 Live Orders Feed</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {orders.map((order) => (
          <div key={order.id} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-amber-400">{order.platform}</span>
              <span className="px-2 py-1 text-xs rounded bg-blue-600">{order.status}</span>
            </div>
            <p className="text-sm font-medium">Order #{order.externalOrderId}</p>
            <p className="text-xs text-gray-400">Total: ${order.totalAmount.toFixed(2)}</p>
            <div className="mt-4 flex gap-2">
              <button 
                onClick={() => handleStatusUpdate(order.id, OrderStatus.ACCEPTED)}
                className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs">
                Accept
              </button>
              <button 
                onClick={() => handleStatusUpdate(order.id, OrderStatus.READY_FOR_PICKUP)}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs">
                Ready
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
