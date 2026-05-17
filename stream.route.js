const express = require('express');
const router = express.Router();
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');

const {testManager, incomingResponse, handleStatus, handleCoachingPaymentWebhook, syncCircle, regAirtable} = require('../Service/EcomPro/register.service');

router.post('/register', async(req, res) => {
  try {

    await incomingResponse(req.body);

    return res.status(200).json({
      message: 'Success'      
    });
  } catch(error) {
    console.log(error);
    return res.status(500).json({
      message: 'Internal server error'
    })
  }
})

router.post('/airtable', async(req, res) => {
  try {

    await handleStatus(req.body);
    return res.status(200).json({
      message: 'Done'
    })
  } catch(error) {
    console.log(error);
    return res.status(500).json({
      message: 'Internal server error'
    })
  }
})

router.post('/reg', async(req, res) => {
  try {
    await regAirtable(req.body);
    return res.status(200).json({
      message: 'Done'
    });
  } catch(error) {
    console.log(error);
    return res.status(500).json({
      message: error.message
    })
  }
})

router.post('/chariow', async(req, res) => {
  try {
    const tag = req.query.tag;
    const email = req.body?.customer?.email;
    const customer = req.body.customer;
    console.log(req.body);
    console.log('TAG = ', tag, 'EMAIL: ', email);
    if (!email || !tag || !customer) {
      return res.status(400).json({
        message: 'Missing email'
      })
    }

    // await handlePaymentWebhook(email, tag, req.body);
    await handleCoachingPaymentWebhook(email, tag, req.body)
    res.status(200).send("Message reçu");
  } catch(error) {
    console.log(error);
    return res.status(500).json({
      message: 'Internal server error'
    })
  }
});

router.post('/sync-circle', async(req, res) => {
  try {
    console.log("members: ", req.body.members || []);

    await syncCircle(req.body.members || []);
    return res.status(200).json({
      message: 'Done'
    })
  } catch(error) {
    console.log(error);
    return res.status(500).json({
      message: 'Internal server error'
    })
  }
})

module.exports = router;