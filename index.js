const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

const corsConfig = {
    origin: true,
    credentials: true,
}

app.use(express.json());
app.use(cors(corsConfig))
app.options('*', cors(corsConfig))


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nlxy4.mongodb.net/?retryWrites=true&w=majority`;

console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const run = async () => {

    try {
        await client.connect();
        console.log('try');
        const productCollenction = client.db("StockParts").collection("products");
        const userCollenction = client.db("StockParts").collection("users");
        const reviewCollenction = client.db("StockParts").collection("reviews");
        const orderCollenction = client.db("StockParts").collection("orders");
        const paymentCollenction = client.db("StockParts").collection("payments");

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollenction.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const order = req.body;
            const price = order.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });
        // load data
        app.get('/products', async (req, res) => {
            const query = {};
            const products = await productCollenction.find(query).toArray();
            res.send(products)
        })
        // load single data from all data
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const product = await productCollenction.findOne(query)
            res.send(product)
        })
        //  update the user
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollenction.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '3h' })
            res.send({ result, token });
        });
        // filter one single user
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const user = await userCollenction.findOne(filter);
            res.send(user);
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const profile = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: profile,
            };
            const result = await userCollenction.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        app.get('/users', async (req, res) => {
            const query = {};
            const users = await userCollenction.find(query).toArray();
            res.send(users)
        })
        // veryfy jwt
        app.put('/users/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const role = req.body;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: role
            }
            const updatedUser = await userCollenction.updateOne(filter, updatedDoc, options);
            res.send(updatedUser);
        })

    //    verify order
        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body;
            const result = await orderCollenction.insertOne(order);
            res.send(result);
        });
        // verify the orders 
        app.get('/orders', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const orders = await orderCollenction.find(query).toArray();
                return res.send(orders);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }
        });

        app.get('/allorders', async (req, res) => {
            const query = {};
            const orders = await orderCollenction.find(query).toArray();
            console.log(orders);
            res.send(orders)
        })

        app.patch('/paidorders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    deleverd: true,
                }
            }
            const updatedOrder = await orderCollenction.updateOne(filter, updatedDoc);
            res.send(updatedOrder);
        })

        app.get('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const order = await orderCollenction.findOne(query)
            res.send(order)
        })

        app.patch('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollenction.insertOne(payment);
            const updatedOrder = await orderCollenction.updateOne(filter, updatedDoc);
            res.send(updatedOrder);
        })

        app.delete('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await orderCollenction.deleteOne(filter);
            res.send(result);
        })

        app.post('/product', verifyJWT, async (req, res) => {
            const product = req.body;
            const result = await productCollenction.insertOne(product);
            res.send(result);
        });

        app.put('/product/:id', async (req, res) => {
            const id = req.params.id;
            const stock = req.body;
            const filter = { _id: id };
            const options = { upsert: true };
            const updateDoc = {
                $set: stock,
            };
            const result = await productCollenction.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        app.delete('/product/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await productCollenction.deleteOne(filter);
            res.send(result);
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollenction.findOne({ email: email });
            const isAdmin = user?.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollenction.insertOne(review);
            res.send(result);
        });

        app.get('/reviews', async (req, res) => {
            const query = {};
            const products = await reviewCollenction.find(query).toArray();
            res.send(products)
        })

    }
    catch {
        // client.close();
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log('Digitaz server is running in port', port);
})

app.get('/', (req, res) => {
    res.send('Hello! I am from Digitaz server.')
})