Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/connectors/doordash/webhook" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "x-correlation-id" = "corr-woo-complete-06" } `
  -Body (@{
    id = 8751
    number = "8751"
    store_id = "WC-STORE-01"
    status = "processing"
    date_created = "2026-08-14T12:00:00Z"
    subtotal = "45.00"
    total_tax = "3.60"
    total = "53.60"
    payment_method = "cod"
    billing = @{
      first_name = "Alice"
      last_name = "Brown"
      email = "alice@example.com"
      phone = "+14155550999"
    }
    shipping = @{
      address_1 = "22 King Street"
      address_2 = "Apartment 4"
      city = "New York"
      postcode = "10001"
    }
    line_items = @(
      @{
        product_id = 1662
        quantity = 2
        price = "15.00"
        total = "30.00"
      },
      @{
        id = 502
        product_id = 14152
        quantity = 1
        price = "15.00"
        total = "15.00"
      }
    )
    shipping_lines = @(
      @{
        method_id = "flat_rate"
        total = "5.00"
      }
    )
  } | ConvertTo-Json -Depth 20)


  Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/connectors/doordash/webhook" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "x-correlation-id" = "corr-orderout-04" } `
  -Body (@{
    source = @{
      externalReferenceId = "4992351741280256"
      orderNumber = "oo_test_order_001"
      placedOn = "2026-08-14T08:47:55.587976Z"
      ods = @{
        name = "OrderOut"
      }
      deliveryCompany = @{
        name = "Ubereats"
      }
    }
    destination = @{
      restaurantName = "Kumars Bakery"
      restaurantId = "0e841c9c-1991-4bd0-ad7f-b1c3ce640cfa"
      externalRestaurantId = "5189587907510272"
    }
    event = "received"
    payload = @{
      customer = @{
        customerName = "Test Customer"
        phoneNumber = "+11111111111"
        streetName = "1 Delivery Address Street"
        zipCode = "12345"
        city = "Awesome City"
        state = "FL"
        deliveryNotes = "Entrance code is 1234"
      }
      order = @{
        orderType = "PICKUP"
        subtotal = 30.00
        tax = 2.40
        deliveryCharge = 3.00
        total = 35.40
        orderNotes = "Add extra ketchup"
        items = @(
          @{
            id = "5195488527777792"
            external_id = "ITEM1662"
            name = "Mutton Biryani"
            quantity = 2
            price = 15.00
            total = 30.00
            modifiers = @(
              @{
                id = "4798434632663040"
                external_id = "MOD-SPICY"
                name = "Extra spicy"
                price = 1.00
                quantity = 1
              }
            )
          }
        )
        payment = @{
          status = "PAID"
        }
      }
    }
  } | ConvertTo-Json -Depth 20)


$response = Invoke-RestMethod `
  -Uri "http://localhost:3001/api/v1/connectors/swiggy/webhook" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "x-correlation-id" = "my-custom-trace-101" } `
  -Body (@{
    order_id = "DD-9000"
    store_id = "STORE-01"
    total = 29.99
    items = @(
      @{
        id = 1662
        name = "Cheeseburger"
        qty = 1
        price = 29.99
      }
    )
  } | ConvertTo-Json -Depth 10)

$response | ConvertTo-Json -Depth 20
