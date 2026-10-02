const Photographer = require('../models/photographerModel.js')
const ImageVault = require('../models/imagebase/imageVaultModel.js')
const Artwork = require('../models/artworkModel.js')
const Order = require('../models/orderModel.js')
const asyncHandler = require('express-async-handler')
const mongoose = require('mongoose')
const RoyaltySettings = require('../models/imagebase/royaltyModel.js')
const Invoice = require('../models/invoiceModel.js')
const Subscription = require('../models/subscriptionModel.js')
const ReferralBalance = require('../models/referralBalanceModel.js')
const ImageAnalytics = require('../models/imagebase/imageAnalyticsModel.js')

async function getTotalViewsByPhotographer(photographerId) {
  
  const result = await ImageAnalytics.aggregate([
    {
      $lookup: {
        from: 'imagevaults', 
        localField: 'image',
        foreignField: '_id',
        as: 'imageData'
      }
    },
    { $unwind: '$imageData' },
    {
      $match: {
        'imageData.photographer': new mongoose.Types.ObjectId(photographerId),
        'imageData.isActive': true
      }
    },
    {
      $group: {
        _id: '$imageData.photographer',
        totalViews: { $sum: '$views' }
      }
    }
  ]);

  return result.length > 0 ? result[0].totalViews : 0;
}

async function getPhotographerImageIds(photographer) {
  const [ivIds, artIds] = await Promise.all([
    ImageVault.find({ photographer }).distinct('_id'),
    Artwork.find({ $or: [{ photographer }, { artist: photographer }] }).distinct('_id')
  ]);
  return [...ivIds, ...artIds].map(id => id.toString());
}

async function getPhotographerOrdersQuery(photographer, extraFilter = {}) {
  const allPhotogIds = await getPhotographerImageIds(photographer);
  const photogObjectId = mongoose.Types.ObjectId.isValid(photographer)
    ? new mongoose.Types.ObjectId(photographer)
    : photographer;

  const query = {
    isPaid: true,
    orderStatus: 'completed',
    $or: [
      { 'orderItems.imageInfo.photographer': photogObjectId },
      { 'orderItems.imageInfo.image': { $in: allPhotogIds.map(id => new mongoose.Types.ObjectId(id)) } },
      { 'orderItems.product': { $in: allPhotogIds.map(id => new mongoose.Types.ObjectId(id)) } },
      { 'items.product': { $in: allPhotogIds.map(id => new mongoose.Types.ObjectId(id)) } }
    ],
    ...extraFilter
  };

  return { query, allPhotogIds };
}

function isItemForPhotographer(orderItem, photographerStr, allPhotogIds) {
  const itemPhotog = orderItem.imageInfo?.photographer?.toString();
  const itemImg = orderItem.imageInfo?.image?.toString();
  const itemProd = orderItem.product?.toString();

  return (
    (itemPhotog && itemPhotog === photographerStr) ||
    (itemImg && allPhotogIds.includes(itemImg)) ||
    (itemProd && allPhotogIds.includes(itemProd))
  );
}


const photographerDashboardData = asyncHandler(async (req, res) => {
  const { photographer } = req.query;
  
  const totalUploadingImgCount = await ImageVault.countDocuments({ photographer, isActive: true });
  const pendingImagesCount = await ImageVault.countDocuments({ photographer, exclusiveLicenseStatus: { $in: ['pending', 'review'] } , isActive: false   });
  const totalViews = await getTotalViewsByPhotographer(photographer)
  
  const { query, allPhotogIds } = await getPhotographerOrdersQuery(photographer);
  const orders = await Order.find(query);
  
  if (!orders || orders.length === 0) {
      return res.json({
          totalUploadingImgCount,
          pendingImagesCount,
          downloads: 0,
          totalSales: 0,
          totalRoyaltyAmount: 0,
          totalPrintCutAmount: 0,
          totalPrintSales: 0,
          monthlyData: [],
          totalViews
      });
  }

  const royaltySettings = await RoyaltySettings.findOne({ licensingType: 'exclusive' });

  if (!royaltySettings) {
      return res.status(404).json({ message: 'Global royalty settings not found.' });
  }

  const photographerData = await Photographer.findOne({ _id: photographer });

  if (!photographerData) {
      return res.status(404).json({ message: "Photographer not found" });
  }

  const rank = photographerData?.rank;

  const subscription = await Subscription.findOne({
      'userInfo.user': photographer,
      'userInfo.userType': 'Photographer',
      isActive: true,
  }).populate('planId');

  let royaltyShare;
  let printRoyaltyShare = royaltySettings?.printRoyaltyShare || 10;

  if (!subscription || subscription?.planId?.name === 'Basic') {
      royaltyShare = royaltySettings?.planWiseRoyaltyShare?.basic || 50;
  } else if (subscription?.planId?.name === 'Intermediate') {
      royaltyShare = royaltySettings?.planWiseRoyaltyShare?.intermediate || 70;
  } else if (subscription?.planId?.name === 'Premium') {
      royaltyShare = royaltySettings?.planWiseRoyaltyShare?.premium || 90;
  } else {
      royaltyShare = 50;
  }

  let totalSales = 0;
  let totalPrintSales = 0;
  let totalRoyaltyAmount = 0;
  let totalPrintCutAmount = 0;
  let downloads = 0;
  let totalPrintDownloads = 0;
  let totalDigitalDownloads = 0;

  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      sales: 0,
      royaltyAmount: 0,
      printCutAmount: 0,
      tds: 0,
      invoiceStatus: 'unpaid', 
  }));
  
  const photogStr = photographer.toString();
  orders.forEach(order => {
      let orderHasPhotogItem = false;
      const items = order.orderItems && order.orderItems.length ? order.orderItems : (order.items || []);
      items.forEach(orderItem => {
          if (!isItemForPhotographer(orderItem, photogStr, allPhotogIds)) {
              return;
          }
          orderHasPhotogItem = true;
          const isPrint = !!orderItem.printType || !!(orderItem.paperInfo && orderItem.paperInfo.paper) || !!(orderItem.frameInfo && orderItem.frameInfo.frame) || !!orderItem.product || !!orderItem.paper || orderItem.imageInfo?.imageModel === 'Artwork';
          
          let price = 0;
          let royalty = 0;
          let subTotal = 0;
          let printCut = 0;

          if (isPrint) {
              subTotal = Number(orderItem.subTotal ?? orderItem.finalPrice ?? orderItem.total ?? 0);
              printCut = (subTotal * printRoyaltyShare) / 100 || 0;
              totalPrintSales += subTotal;
              totalPrintCutAmount += printCut;
              if (subTotal >= 0) {
                  totalPrintDownloads += 1;
              }
          } else {
              price = Number(orderItem.imageInfo?.price || orderItem.subTotal || orderItem.finalPrice || orderItem.total || 0);
              royalty = price * (royaltyShare / 100);
              totalSales += price;
              totalRoyaltyAmount += royalty;
              if (price >= 0) {
                  totalDigitalDownloads += 1;
              }
          }

          const orderMonth = new Date(order.createdAt).getMonth();
         const tds = isNaN(royalty) || isNaN(printCut) ? 0 : (royalty + printCut) * 0.1;

          monthlyData[orderMonth].sales += price;
          monthlyData[orderMonth].royaltyAmount += royalty;
          monthlyData[orderMonth].printCutAmount += printCut;
          monthlyData[orderMonth].tds += tds;
       });
       if (orderHasPhotogItem) {
          downloads += 1;
       }
  });

  for (let data of monthlyData) {
    const anyDateInMonth = new Date(new Date().getFullYear(), data.month - 1, 15); 
    const invoiceExists = await Invoice.exists({
        photographer: photographer,
        startDate: { $lte: anyDateInMonth },
        endDate: { $gte: anyDateInMonth },
        paymentStatus: 'paid',
    });
   
   
    if (invoiceExists) {
        data.invoiceStatus = 'paid';
    }
  }

  const formattedMonthlyData = monthlyData
      .filter(data => data.sales > 0 || data.royaltyAmount > 0 || data.printCutAmount > 0)
      .map(data => ({
          month: data.month,
          sales: parseFloat(data.sales.toFixed(2)),
          royaltyAmount: parseFloat(data.royaltyAmount.toFixed(2)),
          printCutAmount: parseFloat(data.printCutAmount.toFixed(2)),
          tdsAmount: data.tds,
          invoiceStatus: data.invoiceStatus,
      }));

      const categories = await Order.aggregate([
        {
            $match: {
                'orderItems.imageInfo.photographer': new mongoose.Types.ObjectId(photographer)
            }
        },
        { $unwind: "$orderItems" },
        {
            $lookup: {
                from: "imagevaults",
                localField: "orderItems.imageInfo.image",
                foreignField: "_id",
                as: "image"
            }
        },
        { $unwind: "$image" },
        { $unwind: "$image.category" },
        {
            $group: {
                _id: "$image.category",
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: "categories",
                localField: "_id",
                foreignField: "_id",
                as: "categoryDetails"
            }
        },
        { $unwind: "$categoryDetails" }
    ]);
    

  let totalPaidAmount = await Invoice.aggregate([
      {
          $match: {
              photographer: new mongoose.Types.ObjectId(photographer),
              paymentStatus: 'paid'
          }
      },
      {
          $group: {
              _id: null,
              amount: { $sum: "$totalAmountPayable" }
          }
      }
  ]);

  totalPaidAmount = totalPaidAmount && totalPaidAmount.length > 0 ? totalPaidAmount[0].amount : 0

  const payoutHistory = await Invoice.find({  photographer: new mongoose.Types.ObjectId(photographer), 
   // paymentStatus: 'paid'
})
    .populate('photographer')
    .populate('orderDetails.order')
    .populate('orderDetails.image')
    
  const activeBuyers = await Order.aggregate([
        {
          $match: {
            orderStatus: 'completed',
            isPaid: true,
            $or: [
              { 'orderItems.imageInfo.photographer': new mongoose.Types.ObjectId(photographer) },
              { 'orderItems.imageInfo.image': { $in: allPhotogIds.map(id => new mongoose.Types.ObjectId(id)) } },
              { 'orderItems.product': { $in: allPhotogIds.map(id => new mongoose.Types.ObjectId(id)) } },
              { 'items.product': { $in: allPhotogIds.map(id => new mongoose.Types.ObjectId(id)) } }
            ]
          }
        },  
        {
          $group: {
            _id: { $ifNull: ["$userInfo.user", "$customer.phone", "$customer.email", "$_id"] }
          }
        },  
        { $count: "activeBuyers" },  
    ]);

 
  const referralBalance = await ReferralBalance.aggregate([
        {
          $match: {
            photographer: new mongoose.Types.ObjectId(photographer)
          },
        },
        {
          $group: {
            _id: null,
            price: { $sum: '$amount' },
          },
        },
      ]);
      
  const totalReferralAmount = referralBalance.length > 0 ? referralBalance[0].price : 0;

  res.status(200).send({
      totalUploadingImgCount,
      pendingImagesCount,
      totalSales: parseFloat(totalSales?.toFixed(2)),
      totalRoyaltyAmount: parseFloat(totalRoyaltyAmount?.toFixed(2)),
      totalPrintCutAmount: parseFloat(totalPrintCutAmount?.toFixed(2)),
      totalPrintSales: parseFloat(totalPrintSales?.toFixed(2)),
      monthlyData: formattedMonthlyData,
      downloads,
      frequentlyUsedCategories: categories,
      totalPaidAmount,
      payoutHistory,
      totalPrintDownloads,
      totalDigitalDownloads,
      activeBuyers: activeBuyers[0]?.activeBuyers || 0,
      totalReferralAmount,
      totalViews
  });

});

const customPhotographerRevenueData  = asyncHandler(async (req, res) => {
    const { startDate, endDate, photographer }  = req.query

    if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required." });
      }

    const start = new Date(new Date(startDate).setHours(0, 0, 0, 0)); 
    const end = new Date(new Date(endDate).setHours(23, 59, 59, 999)); 

    const { query, allPhotogIds } = await getPhotographerOrdersQuery(photographer, {
        createdAt: { $gte: start, $lte: end }
    });
    const orders = await Order.find(query);
    
    let totalSales = 0;
    let totalPrintSales = 0;
    let totalRoyaltyAmount = 0;
    let totalPrintCutAmount = 0;
    let downloads = 0;
    let totalPrintDownloads = 0;
    let totalDigitalDownloads = 0;
        
    const royaltySettings = await RoyaltySettings.findOne({ licensingType: 'exclusive' });

    if (!royaltySettings) {
        return res.status(404).json({ message: 'Global royalty settings not found.' });
    }

    const subscription = await Subscription.findOne({
        'userInfo.user': photographer,
        'userInfo.userType': 'Photographer',
        isActive: true,
    }).populate('planId');
  
    let royaltyShare;
    let printRoyaltyShare = royaltySettings?.printRoyaltyShare || 10;
  
    if (!subscription || subscription?.planId?.name === 'Basic') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.basic || 50;
    } else if (subscription?.planId?.name === 'Intermediate') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.intermediate || 70;
    } else if (subscription?.planId?.name === 'Premium') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.premium || 90;
    } else {
        royaltyShare = 50;
    }
  
    const photogStr = photographer.toString();
    orders.forEach(order => {
        let orderHasPhotogItem = false;
        const items = order.orderItems && order.orderItems.length ? order.orderItems : (order.items || []);
        items.forEach(orderItem => {
            if (!isItemForPhotographer(orderItem, photogStr, allPhotogIds)) {
                return;
            }
            orderHasPhotogItem = true;
            const isPrint = !!orderItem.printType || !!(orderItem.paperInfo && orderItem.paperInfo.paper) || !!(orderItem.frameInfo && orderItem.frameInfo.frame) || !!orderItem.product || !!orderItem.paper || orderItem.imageInfo?.imageModel === 'Artwork';
            
            let price = 0;
            let royalty = 0;
            let subTotal = 0;
            let printCut = 0;

            if (isPrint) {
                subTotal = Number(orderItem.subTotal ?? orderItem.finalPrice ?? orderItem.total ?? 0);
                printCut = (subTotal * printRoyaltyShare) / 100 || 0;
                totalPrintSales += subTotal;
                totalPrintCutAmount += printCut;
                if (subTotal >= 0) {
                    totalPrintDownloads += 1;
                }
            } else {
                price = Number(orderItem.imageInfo?.price || orderItem.subTotal || orderItem.finalPrice || orderItem.total || 0);
                royalty = price * (royaltyShare / 100);
                totalSales += price;
                totalRoyaltyAmount += royalty;
                if (price >= 0) {
                    totalDigitalDownloads += 1;
                }
            }
        });
        if (orderHasPhotogItem) {
            downloads += 1;
        }
    });
  
    const startOfDay = new Date(new Date(startDate).setHours(0, 0, 0, 0)); 
    const endOfDay = new Date(new Date(endDate).setHours(23, 59, 59, 999)); 

    const referralBalance = await ReferralBalance.aggregate([
        {
          $match: {
            photographer: new mongoose.Types.ObjectId(photographer),
            createdAt: {
                $gte: startOfDay,
                $lte: endOfDay
            }
          },
        },
        {
          $group: {
            _id: null,
            price: { $sum: '$amount' },
          },
        },
      ]);

      const totalReferralAmount = referralBalance.length > 0 ? referralBalance[0].price : 0;

    res.status(200).send({
        totalSales: parseFloat(totalSales?.toFixed(2)),
        totalPrintSales: parseFloat(totalPrintSales?.toFixed(2)),
        totalRoyaltyAmount: parseFloat(totalRoyaltyAmount?.toFixed(2)),
        totalPrintCutAmount: parseFloat(totalPrintCutAmount?.toFixed(2)),
        downloads,
        totalPrintDownloads,
        totalDigitalDownloads,
        totalReferralAmount
    })
})


const revenueForCurrentMonth = asyncHandler(async (req, res) => {
    const photographer = req.query.photographer;

    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate);

    const { query, allPhotogIds } = await getPhotographerOrdersQuery(photographer, {
        createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    });
    const orders = await Order.find(query);

    let totalSales = 0;
    let totalPrintSales = 0;
    let totalRoyaltyAmount = 0;
    let totalPrintCutAmount = 0;
    let downloads = 0;
    let totalPrintDownloads = 0;
    let totalDigitalDownloads = 0;

    const royaltySettings = await RoyaltySettings.findOne({ licensingType: 'exclusive' });

    if (!royaltySettings) {
        return res.status(404).json({ message: 'Global royalty settings not found.' });
    }

    const subscription = await Subscription.findOne({
        'userInfo.user': photographer,
        'userInfo.userType': 'Photographer',
        isActive: true,
    }).populate('planId');

    let royaltyShare;
    let printRoyaltyShare = royaltySettings?.printRoyaltyShare || 10;

    if (!subscription || subscription?.planId?.name === 'Basic') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.basic || 50;
    } else if (subscription?.planId?.name === 'Intermediate') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.intermediate || 70;
    } else if (subscription?.planId?.name === 'Premium') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.premium || 90;
    } else {
        royaltyShare = 50;
    }

    const photogStr = photographer.toString();
    orders.forEach(order => {
        let orderHasPhotogItem = false;
        const items = order.orderItems && order.orderItems.length ? order.orderItems : (order.items || []);
        items.forEach(orderItem => {
            if (!isItemForPhotographer(orderItem, photogStr, allPhotogIds)) {
                return;
            }
            orderHasPhotogItem = true;
            const isPrint = !!orderItem.printType || !!(orderItem.paperInfo && orderItem.paperInfo.paper) || !!(orderItem.frameInfo && orderItem.frameInfo.frame) || !!orderItem.product || !!orderItem.paper || orderItem.imageInfo?.imageModel === 'Artwork';
            
            let price = 0;
            let royalty = 0;
            let subTotal = 0;
            let printCut = 0;

            if (isPrint) {
                subTotal = Number(orderItem.subTotal ?? orderItem.finalPrice ?? orderItem.total ?? 0);
                printCut = (subTotal * printRoyaltyShare) / 100 || 0;
                totalPrintSales += subTotal;
                totalPrintCutAmount += printCut;
                if (subTotal >= 0) {
                    totalPrintDownloads += 1;
                }
            } else {
                price = Number(orderItem.imageInfo?.price || orderItem.subTotal || orderItem.finalPrice || orderItem.total || 0);
                royalty = price * (royaltyShare / 100);
                totalSales += price;
                totalRoyaltyAmount += royalty;
                if (price >= 0) {
                    totalDigitalDownloads += 1;
                }
            }
        });
        if (orderHasPhotogItem) {
            downloads += 1;
        }
    });

    res.status(200).send({
        totalSales: parseFloat(totalSales?.toFixed(2)),
        totalPrintSales: parseFloat(totalPrintSales?.toFixed(2)),
        totalRoyaltyAmount: parseFloat(totalRoyaltyAmount?.toFixed(2)),
        totalPrintCutAmount: parseFloat(totalPrintCutAmount?.toFixed(2)),
        downloads,
        totalPrintDownloads,
        totalDigitalDownloads
    });
});



const revenueForCurrentFiscalYear = asyncHandler(async (req, res) => {
    const photographer = req.query.photographer;
    const currentDate = new Date();
    
    let fiscalYearStart = new Date(currentDate.getFullYear(), 3, 1);  
    if (currentDate.getMonth() < 3) {
        fiscalYearStart = new Date(currentDate.getFullYear() - 1, 3, 1);
    }
    const fiscalYearEnd = new Date(currentDate);

    const { query, allPhotogIds } = await getPhotographerOrdersQuery(photographer, {
        createdAt: { $gte: fiscalYearStart, $lte: fiscalYearEnd }
    });
    const orders = await Order.find(query);

    let totalSales = 0;
    let totalPrintSales = 0;
    let totalRoyaltyAmount = 0;
    let totalPrintCutAmount = 0;
    let downloads = 0;
    let totalPrintDownloads = 0;
    let totalDigitalDownloads = 0;

    const royaltySettings = await RoyaltySettings.findOne({ licensingType: 'exclusive' });

    if (!royaltySettings) {
        return res.status(404).json({ message: 'Global royalty settings not found.' });
    }

    const subscription = await Subscription.findOne({
        'userInfo.user': photographer,
        'userInfo.userType': 'Photographer',
        isActive: true,
    }).populate('planId');

    let royaltyShare;
    let printRoyaltyShare = royaltySettings?.printRoyaltyShare || 10;

    if (!subscription || subscription?.planId?.name === 'Basic') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.basic || 50;
    } else if (subscription?.planId?.name === 'Intermediate') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.intermediate || 70;
    } else if (subscription?.planId?.name === 'Premium') {
        royaltyShare = royaltySettings?.planWiseRoyaltyShare?.premium || 90;
    } else {
        royaltyShare = 50;
    }

    const photogStr = photographer.toString();
    orders.forEach(order => {
        let orderHasPhotogItem = false;
        const items = order.orderItems && order.orderItems.length ? order.orderItems : (order.items || []);
        items.forEach(orderItem => {
            if (!isItemForPhotographer(orderItem, photogStr, allPhotogIds)) {
                return;
            }
            orderHasPhotogItem = true;
            const isPrint = !!orderItem.printType || !!(orderItem.paperInfo && orderItem.paperInfo.paper) || !!(orderItem.frameInfo && orderItem.frameInfo.frame) || !!orderItem.product || !!orderItem.paper || orderItem.imageInfo?.imageModel === 'Artwork';
            
            let price = 0;
            let royalty = 0;
            let subTotal = 0;
            let printCut = 0;

            if (isPrint) {
                subTotal = Number(orderItem.subTotal ?? orderItem.finalPrice ?? orderItem.total ?? 0);
                printCut = (subTotal * printRoyaltyShare) / 100 || 0;
                totalPrintSales += subTotal;
                totalPrintCutAmount += printCut;
                if (subTotal >= 0) {
                    totalPrintDownloads += 1;
                }
            } else {
                price = Number(orderItem.imageInfo?.price || orderItem.subTotal || orderItem.finalPrice || orderItem.total || 0);
                royalty = price * (royaltyShare / 100);
                totalSales += price;
                totalRoyaltyAmount += royalty;
                if (price >= 0) {
                    totalDigitalDownloads += 1;
                }
            }
        });
        if (orderHasPhotogItem) {
            downloads += 1;
        }
    });

    res.status(200).send({
        totalSales: parseFloat(totalSales?.toFixed(2)),
        totalPrintSales: parseFloat(totalPrintSales?.toFixed(2)),
        totalRoyaltyAmount: parseFloat(totalRoyaltyAmount?.toFixed(2)),
        totalPrintCutAmount: parseFloat(totalPrintCutAmount?.toFixed(2)),
        downloads,
        totalPrintDownloads,
        totalDigitalDownloads
    });
});


module.exports = {
    photographerDashboardData,
    customPhotographerRevenueData,
    revenueForCurrentFiscalYear,
    revenueForCurrentMonth
}