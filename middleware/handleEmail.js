const nodemailer = require("nodemailer");
const asyncHandler = require("express-async-handler");
const generator = require("generate-password");
const dotenv = require("dotenv");
const { S3Client } = require("@aws-sdk/client-s3");
const { S3 } = require("@aws-sdk/client-s3");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const axios = require("axios");

const config = {
  region: process.env.AWS_BUCKET_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
};

const s3 = new S3Client(config);

const transporter = nodemailer.createTransport({
  // service: "gmail",
  host: "smtpout.secureserver.net",
  port: 465,
  secure: true,

  auth: {
    user: process.env.USER_EMAIL,
    pass: process.env.USER_PASS,
  },
});

const verifyTransporter = asyncHandler(async (req, res, next) => {
  try {
    await transporter.verify();

    next();
  } catch (error) {
    console.log(error);
    throw new Error("Email transporter verification failed");
  }
});

const sendResetEmail = asyncHandler(async (email) => {
  const otp = String(Math.floor(100000 + Math.random() * 900000));

  const info = await transporter.sendMail({
    from: `Clicked Art ${process.env.USER_EMAIL}`,
    to: email,
    subject: `Your New Password for Login`,
    text: `
  Hello,
  
  We’ve generated a Temporary New Password for your account to help you log in securely.
  Please make sure to change your password immediately after logging in.
  
  Your Temporary Password is: ${otp}
  
  Please note:
    • Keep it confidential and do not share it with anyone.
    • Once you’ve logged in, we recommend changing your password to ensure your account’s security.
    • If you didn’t request this, please contact us immediately.
  
  We’re here to assist if you have any questions or need help.
  
  Warm Regards,  
  Team ClickedArt.com  
  www.clickedart.com  
  support@clickedart.com  
  Empowering Photographers Everywhere  
  
  P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
      `,
  });

  return otp;
});

const sendVerificationEmail = asyncHandler(async (otp, email) => {
  const info = await transporter.sendMail({
    from: `Clicked Art ${process.env.USER_EMAIL}`,
    to: email,
    subject: `Verify Your Email Address - Clicked Art`,
    text: `
Hello,

Thank you for signing up with Clicked Art! To complete the verification of your email address, please use the One-Time Password (OTP) provided below.

Your OTP/Verification Code is: ${otp}

Please note:
  • This OTP is valid only for one-time use.
  • Keep it confidential and do not share it with anyone.
  • Once verified, you’ll gain full access to your account.

If you didn’t sign up for Clicked Art, please disregard this email or contact us immediately.

We’re here to assist if you have any questions or need help.

Warm Regards,  
Team ClickedArt.com  
www.clickedart.com  
support@clickedart.com  
Empowering Photographers Everywhere  

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
        `,
  });
  return true;
});

const sendApprovedMail = asyncHandler(async (photographerName, email) => {
  const info = await transporter.sendMail({
    from: `Clicked Art ${process.env.USER_EMAIL}`,
    to: email,
    subject: "Welcome to ClickedArt.com – Your Registration is Approved!",
    text: `
  Dear ${photographerName},
  
  Congratulations!
  
  Your registration on ClickedArt.com has been successfully approved. You are now a part of our growing community of talented photographers from around the globe. We are thrilled to have you on board and excited to see your creativity flourish!
  
  Here’s what you can do now:
  
  1. Upload Your Photos:
     - You can now upload your photos for approval directly from your profile page.
     - Our team will review them to ensure they meet our quality standards. Once approved, your work will be live on ClickedArt.com and ready for purchase by art enthusiasts and businesses worldwide.
  
  2. Monetization Request:
     - You can enable monetization for your account by submitting a request through your profile page.
     - This will allow you to start earning royalties on your digital downloads and print sales.
  
  We are committed to supporting your journey as a photographer and providing you with the tools to turn your creativity into opportunity. If you have any questions or need assistance, feel free to reach out to us at support@clickedart.com.
  
  Start uploading your masterpieces today and let the world discover your talent!
  
  Warm Regards,  
  Team ClickedArt.com  
  www.clickedart.com  
  support@clickedart.com  
  Empowering Photographers Everywhere  
  
  P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
      `,
  });
  return true;
});

const sendRejectionEmail = asyncHandler(async (name, email, reasons = []) => {
  reasons = [
    "Reason 1: Insufficient details in the application on form.",
    "Reason 2: Supporting documents were incomplete or unclear.",
  ];

  const formattedReasons =
    Array.isArray(reasons) && reasons.length > 0
      ? reasons.map((reason) => `• ${reason}`).join("\n")
      : "No specific reasons provided.";

  const info = await transporter.sendMail({
    from: `Clicked Art ${process.env.USER_EMAIL}`,
    to: email,
    subject: "Registration Update on ClickedArt.com",
    text: `
  Dear ${name},
  
  Thank you for your interest in joining ClickedArt.com. We truly appreciate your effort in registering with us and your enthusiasm to be a part of our community.
  
  After reviewing your registration details, we regret to inform you that your application has not been approved at this time.
  
  Reason(s) for Disapproval:
  ${formattedReasons}
  
  You are welcome to re-apply for registration after 24 hours, ensuring that the concerns mentioned above are addressed. We highly value your interest and look forward to receiving your application again.
  
  If you have any questions or need clarification regarding this decision, please don’t hesitate to contact us at support@clickedart.com. We are here to assist you in becoming a part of our vibrant photography community.
  
  Warm Regards,  
  Team ClickedArt.com  
  www.clickedart.com  
  support@clickedart.com  
  Empowering Photographers Everywhere  
  
  P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
      `,
  });

  return true;
});

const sendApprovedImageMail = asyncHandler(
  async (photographerName, email, imageTitle) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Your Image on ClickedArt.com has been Approved!",
      text: `
Dear ${photographerName},

Congratulations!

Your image titled "${imageTitle}" has been successfully approved and is now live on ClickedArt.com. Your work is now available for purchase by art enthusiasts and businesses worldwide.

Here’s what you can do now:

1. Promote Your Work:
   - Share your approved image across your social media channels and website to attract potential buyers.
   - You can also add more images to your portfolio to increase your exposure.

We are excited to see your creativity flourishing on ClickedArt.com. If you have any questions or need assistance, feel free to reach out to us at support@clickedart.com.

Keep up the great work, and continue sharing your masterpieces with the world!

Warm Regards,  
Team ClickedArt.com  
www.clickedart.com  
support@clickedart.com  
Empowering Photographers Everywhere  

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
    `,
    });
    return true;
  },
);

const sendUnapprovedImageMail = asyncHandler(
  async (
    photographerName,
    email,
    imageTitle,
    reasons = [
      "Reason 1: Image quality did not meet our standards.",
      "Reason 2: Image was blurry or poorly lit.",
    ],
  ) => {
    const formattedReasons =
      Array.isArray(reasons) && reasons.length > 0
        ? reasons.map((reason) => `• ${reason}`).join("\n")
        : "No specific reasons provided.";

    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Update on Your Image Submission to ClickedArt.com",
      text: `
Dear ${photographerName},

Thank you for submitting your image titled "${imageTitle}" to ClickedArt.com.

After reviewing your image, we regret to inform you that it has not been approved at this time.

Reason(s) for Disapproval:
${formattedReasons}

You are welcome to make the necessary adjustments and re-upload the image. We encourage you to keep submitting your work, as we truly value your creativity and contributions to our platform.

If you need any clarification or assistance regarding the review process, feel free to reach out to us at support@clickedart.com. We are here to help.

Warm Regards,  
Team ClickedArt.com  
www.clickedart.com  
support@clickedart.com  
Empowering Photographers Everywhere  

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
    `,
    });
    return true;
  },
);

const sendMonetizationMail = asyncHandler(async (photographerName, email) => {
  const info = await transporter.sendMail({
    from: `Clicked Art ${process.env.USER_EMAIL}`,
    to: email,
    subject: "Monetization Approved – Start Earning with ClickedArt.com!",
    text: `
Dear ${photographerName},

We are thrilled to inform you that your monetization request has been approved! You are now eligible to earn royalties for your work through ClickedArt.com.

Royalty Model Details:

Here’s how your earnings are calculated based on your membership plan:

Basic User (Initial Membership):
  • Digital Download Sales: 50% of the sale value
  • Print Orders: 10% flat on the sale value

Intermediate User (Upgrade Available):
  • Digital Download Sales: 70% of the sale value
  • Print Orders: 10% flat on the sale value

Premium User (Upgrade Available):
  • Digital Download Sales: 90% of the sale value
  • Print Orders: 10% flat on the sale value

Key Points to Note:
  • You are currently on the Basic Membership plan. To increase your royalty percentage, 
    you can upgrade your membership from your profile page at any time.
  • Taxes such as TDS and other applicable government levies will be deducted as per norms.
  • You can track your sales, earnings, and payouts through your dashboard on ClickedArt.com.

We are excited to help you showcase your creativity and turn your passion into a source of income. If you have any questions or need assistance, feel free to reach out to us at support@clickedart.com.

Congratulations again, and let’s create magic together!

Warm Regards,  
Team ClickedArt.com  
www.clickedart.com  
support@clickedart.com  
Empowering Photographers Everywhere  

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
    `,
  });
  return true;
});

const sendMonetizationDisApprovalMail = asyncHandler(
  async (
    photographerName,
    email,
    reasons = [
      " Insufficient portfolio quality to meet our standards.",
      " Required verification documents were incomplete or unclear.",
    ],
  ) => {
    const formattedReasons =
      Array.isArray(reasons) && reasons.length > 0
        ? reasons.map((reason) => `• ${reason}`).join("\n")
        : "No specific reasons provided.";

    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Monetization Request Update",
      text: `
Dear ${photographerName},

Thank you for submitting your request for monetization on ClickedArt.com. After reviewing 
your application, we regret to inform you that your monetization request has not been 
  approved at this time. 
Reason(s) for Disapproval: 
  ${formattedReasons}
You are welcome to re-apply for monetization after 24 hours, ensuring that the concerns 
mentioned above are addressed. We highly encourage you to review your portfolio and 
account details to strengthen your next application. 

If you need further assistance or clarification regarding this decision, please don’t hesitate to 
reach out to us at support@clickedart.com  
We appreciate your effort and dedication and look forward to assisting you in your journey as 
a creative photographer with ClickedArt.com  
Warm regards, 

Team ClickedArt.com 
www.clickedart.com
support@clickedart.com
Empowering Photographers Everywhere

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
      `,
    });
    return true;
  },
);

const setApprovedImageOfMonetizedProfile = asyncHandler(
  async (photographerName, email, imageTitle) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Your Photo Has Been Approved and is Ready for Sale! ",
      text: `
 Dear ${photographerName},

  We are excited to inform you that your recently uploaded photo titled ${imageTitle} has been approved! 
  It is now live on your ClickedArt.com profile and available for purchase by buyers. 

WHAT HAPPENS NEXT? 

  • Digital Sales: Earn up to [50%/70%/90%] on digital downloads, depending on your membership 
  tier. 
  • Print Sales: Receive a flat 10% royalty on every printed copy sold. 
  • You can monitor your sales, earnings, and buyer interactions on your https://www.clickedart.com/dashboard. 

BOOST YOUR VISIBILITY 

  • Share your ClickedArt profile link on social media to attract potential buyers. 
  • Regularly upload high-quality photos to expand your portfolio and increase your chances of 
  sales. 
  Thank you for being part of ClickedArt.com! Your creativity inspires us all. 

  Warm regards, 
  Team ClickedArt.com 
  www.clickedart.com
  support@clickedart.com
  Empowering Photographers Everywhere

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
    `,
    });
    return true;
  },
);

const sendEventSubmissionConfirmation = asyncHandler(
  async (photographerName, email, imageTitle) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Congratulations - Your Photograph Has Been Selected!",
      text: `
Dear ${photographerName},

We are delighted to inform you that your submitted photograph titled *"${imageTitle}"* has been selected by our expert jury for display in the “Frames of India” Photo Exhibition.

This selection reflects the creativity, story, and essence your work brings to the theme:
“Celebrating 78 Years of Indian Independence”

________________________________________

Exhibition Details:
• Dates: 11th - 17th August 2025
• Venue: Hazratganj Metro Station, Lucknow

________________________________________

What This Means:
• Your photograph(s) will be professionally printed on premium, museum-grade archival media by the organizers.
• The selected work(s) will be part of a public exhibition at one of the city's busiest locations.
• No cost is incurred by you - participation and printing are fully sponsored.

________________________________________

Revenue Sharing (in case of sales):
• 70% to organizers (covers printing, logistics, exhibition management)
• 30% to you, the photographer - paid within one month of sale
• You may also purchase your own exhibited print at a 30% discount

________________________________________

Next Steps:
You will receive final print previews for confirmation before exhibition.
Our team will also contact you for any additional details needed.

________________________________________

Thank you for sharing your art with the nation.

Warm regards,  
Team ClickedArt  
📧 support@clickedart.com  
🌐 www.clickedart.com
    `,
    });

    return true;
  },
);

const setApprovedImageOfNonMonetizedProfile = asyncHandler(
  async (photographerName, email, imageTitle) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: " Your Photo Has Been Approved By ClickedArt! ",
      text: `
Dear ${photographerName},

  We are excited to inform you that your recently uploaded photo titled ${imageTitle} has been approved! 

  What’s Next? 

  • Your approved photo is now visible in your catalog on ClickedArt.com. 
  • Currently, it is available for browsing by buyers, but since your monetization is pending 
  approval, it is not yet available for sale. 

Apply for Monetization 

  To enable sales and start earning royalties, please apply for monetization from your profile 
  page. Here’s how: 

  1. Log in to your account on ClickedArt.com. 
  2. Navigate to your profile page. 
  3. Click the “Apply for Monetization” button and follow the instructions. 

Once monetization is approved, your approved photos will be listed for sale, and you’ll earn 
royalties based on your user tier: 

  • Basic User: 50% on digital downloads, 10% on print orders 
  • Intermediate User: 70% on digital downloads, 10% on print orders 
  • Premium User: 90% on digital downloads, 10% on print orders 

  For any assistance, feel free to contact us at support@clickedart.com. 

  Thank you for being a valued part of the ClickedArt community. We can’t wait to see you 
  thrive! 

  Warm regards, 
  Team ClickedArt.com 
  www.clickedart.com
  support@clickedart.com
  Empowering Photographers Everywhere 

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
    `,
    });
    return true;
  },
);

const sendUnapprovedImageMailOfMonetizedProfile = asyncHandler(
  async (
    photographerName,
    email,
    imageTitle,
    reasons = [
      "Reason 1: Image quality did not meet our standards.",
      "Reason 2: Image was blurry or poorly lit.",
    ],
  ) => {
    const formattedReasons =
      Array.isArray(reasons) && reasons.length > 0
        ? reasons.map((reason) => `• ${reason}`).join("\n")
        : "No specific reasons provided.";

    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Your Photo Upload Requires Revisions ",
      text: `
Dear ${photographerName},

Thank you for submitting your image titled "${imageTitle}" to ClickedArt.com.

Upon review, we regret to 
inform you that your submission did not meet our platform's guidelines and has been rejected.

Reason(s) for Disapproval:
${formattedReasons}

NEXT STEPS: 

You can revise your photo and re-upload it for review. To avoid future rejections, please adhere to the 
following guidelines: 

    • Ensure the resolution is at least 250 DPI and the minimum size is 2000 x 2500 pixels. 
    • Avoid watermarks, logos, or text overlays. 
    • Provide accurate metadata (title, description, keywords). 

NEED ASSISTANCE? 

Our team is here to help! If you have questions about the rejection or need support, feel free to reach out to 
us at support@clickedart.com  

We value your contribution to ClickedArt.com and look forward to seeing your updated submission soon. 

Warm regards, 
Team ClickedArt.com 
www.clickedart.com
support@clickedart.com
Empowering Photographers Everywhere

P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
      `,
    });
    return true;
  },
);

const sendUnapprovedImageMailOfNonMonetizedProfile = asyncHandler(
  async (
    photographerName,
    email,
    imageTitle,
    reasons = [
      "Reason 1: Image quality did not meet our standards.",
      "Reason 2: Image was blurry or poorly lit.",
    ],
  ) => {
    const formattedReasons =
      Array.isArray(reasons) && reasons.length > 0
        ? reasons.map((reason) => `• ${reason}`).join("\n")
        : "No specific reasons provided.";

    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Update on Your Photo Upload",
      text: `
Dear ${photographerName},

Thank you for sharing your work with ClickedArt.com.

After careful review, we regret to inform you that your uploaded photo, "${imageTitle}", could not be approved due to the following reason(s):

${formattedReasons}

----------------------------------------
Next Steps
----------------------------------------

Please address the issues mentioned above and re-upload the photo after 24 hours for review.

To ensure approval, make sure your photo meets the following guidelines:

Technical Requirements:
• Upload photos in JPEG or PNG format.
• Ensure the resolution is at least 300 DPI for print-quality images.
• Minimum dimensions: 2000 x 2500 pixels (or equivalent aspect ratio).
• File size should be between 5 MB to 50 MB.

Content Standards:
• Only upload original work; plagiarism or copyright infringement is strictly prohibited.
• Avoid images with watermarks, logos, or text overlays.
• Ensure the photo does not contain offensive, explicit, or illegal content.
• Photos should not depict or promote violence, hatred, or discrimination.
• Wildlife and nature photos must adhere to ethical practices (e.g., no baiting or staged wildlife shots).

Aesthetic and Quality Requirements:
• Images should be sharp and free from excessive noise, blurriness, or over-processing.
• Avoid over-saturation or unnatural color corrections.
• Composition should be visually appealing and follow basic photography rules (e.g., rule of thirds, leading lines).
• No visible branding or distracting elements in the frame unless it's part of the subject (e.g., product photography).

Metadata and Descriptions:
• Provide accurate titles, descriptions, and keywords for each photo.
• Avoid misleading tags or keywords to ensure proper categorization.
• Ensure the title and description are free of grammatical errors and typos.

Legal and Ethical Compliance:
• Obtain necessary model or property releases for photos featuring identifiable people or private property.
• Respect privacy rights—do not upload images taken without consent in private settings.
• Do not upload photos that violate local laws or community standards.

----------------------------------------
Monetization Reminder
----------------------------------------

Once your photos are approved, you can apply for monetization to start earning royalties for your work. To apply:
1. Log in to your account.
2. Navigate to your profile page.
3. Click “Apply for Monetization” and complete the process.

If you have questions or need help, feel free to reach out at support@clickedart.com. We appreciate your efforts and look forward to seeing more of your creative work!

Warm regards,  
Team ClickedArt  
www.clickedart.com  
support@clickedart.com  

P.S. Follow us on Instagram at https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
    `,
    });
    return true;
  },
);

const sendMembershipUpgradeMail = asyncHandler(
  async (photographerName, membershipType, email) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Welcome to Your Upgraded Membership on ClickedArt.com!",
      text: `
Dear ${photographerName},

Congratulations on upgrading your membership to "${membershipType}"! We’re thrilled to have you unlock a new level of opportunities and benefits designed to elevate your photography journey with ClickedArt.com.

-------------------------------------------
Here’s What Your Upgrade Brings You:
-------------------------------------------

1. Higher Earnings:
   • Intermediate Membership: Earn 70% royalty on digital downloads and 10% flat royalty on print orders.
   • Premium Membership: Earn 90% royalty on digital downloads and 10% flat royalty on print orders.

2. Enhanced Tools and Features:
   • Unlimited Catalog Creation: Showcase your creativity without any restrictions.
   • Social Media Auto-Posting: Seamlessly share your uploaded photos on your social media profiles to gain visibility.
   • Watermarking Tool: Protect your images with a professional watermark while promoting your brand.
   • Priority Support: Enjoy faster assistance and dedicated customer support.

3. Exclusive Marketing Support:
   • Marketing Campaigns: Intermediate and Premium members receive targeted exposure in promotional efforts, giving your photos greater reach and visibility.

4. Advanced Insights:
   • Analytics Dashboard: Access in-depth analytics to track your performance, downloads, and customer preferences to fine-tune your offerings.

-------------------------------------------
What’s Next?
-------------------------------------------

Start exploring these benefits today:
1. Maximize Your Exposure: Update your catalog with your best works.
2. Engage with the Tools: Use watermarking, analytics, and social media auto-posting to strengthen your brand.
3. Grow Your Earnings: Reach out to your audience and let them know about your upgraded profile.

-------------------------------------------
Thank You!
-------------------------------------------

Thank you for choosing ClickedArt.com as your partner in your photography journey. Together, let’s turn your passion into profit and showcase your creativity to the world!

If you have any questions or need further assistance, feel free to contact us at support@clickedart.com.

Warm Regards,  
Team ClickedArt  
www.clickedart.com  
support@clickedart.com  

P.S. Follow us on Instagram at https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
      `,
    });
    return true;
  },
);

const sendOrderThankYouMail = asyncHandler(
  async (customerName, orderDate, items, customerEmail, s3Links, orderId) => {
    let attachments = [];

    // if (Array.isArray(s3Links) && s3Links.length > 0) {

    //   for (let link of s3Links) {
    //     const response = await axios.get(link, { responseType: 'arraybuffer' });

    //     attachments.push({
    //       filename: 'order-details.pdf',
    //       content: response.data,
    //       contentType: 'application/pdf',
    //     });
    //   }
    // }

    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: customerEmail,
      cc: "finance@clickedart.com",
      subject: "Thank You for Your Order on ClickedArt.com!",
      text: `
Dear ${customerName},

Thank you for placing your order with ClickedArt.com! We are thrilled to have you as part of our community that celebrates creativity and artistry.

________________________________________
Order Details:
• Order Date: ${orderDate}
• Items Purchased:
${items} ...

You can view your complete order details and download any digital purchases directly from your Order History Page.

________________________________________
Order Link(s):
${
  Array.isArray(s3Links) && s3Links.length > 0
    ? s3Links.map((link, idx) => `  ${idx + 1}. ${link}`).join("\n")
    : "  No downloadable items found."
}

________________________________________
What Happens Next?
• Digital Downloads:
  For digital purchases, your files will be ready to download under your account section.
• Print Orders:
  If you've ordered printed photos, rest assured that our team has started processing your order. You'll receive a tracking link once the item is shipped.

________________________________________
Need Assistance?
If you have any questions about your order, feel free to reach out to us at support@clickedart.com.

________________________________________
We hope you love your purchase and enjoy showcasing the incredible talent of our photographers! Thank you for supporting creativity and contributing to our mission of bringing unique art to life.

Warm Regards,
Team ClickedArt
www.clickedart.com
support@clickedart.com

________________________________________
P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
      `,
      // attachments,
    });

    return true;
  },
);

const sendMembershipRenewalReminderMail = asyncHandler(
  async (photographerName, email) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject:
        "Your Membership with ClickedArt.com is Expiring Soon – Renew Today!",
      text: `
Dear ${photographerName},

We hope you’ve been enjoying your membership on ClickedArt.com! We’re writing to let you know that your current membership is set to expire soon.

Don’t let your benefits lapse—renew your membership today to continue accessing the tools, features, and opportunities that help elevate your photography journey.

-------------------------------------------
Why Renew Your Membership?
-------------------------------------------

1. **Higher Earnings**:
   - Intermediate Membership: Earn 70% royalty on digital downloads and 10% flat royalty on print orders.
   - Premium Membership: Earn 90% royalty on digital downloads and 10% flat royalty on print orders.

2. **Enhanced Tools and Features**:
   - Unlimited Catalog Creation: Showcase your creativity without restrictions.
   - Social Media Auto-Posting: Seamlessly share your uploaded photos on social media to gain visibility.
   - Watermarking Tool: Protect your images with a professional watermark while promoting your brand.
   - Priority Support: Enjoy faster assistance and dedicated customer support.

3. **Exclusive Marketing Support**:
   - Marketing Campaigns: Intermediate and Premium members receive targeted exposure in promotional efforts, giving your photos greater reach.

4. **Advanced Insights**:
   - Analytics Dashboard: Access in-depth analytics to track your performance, downloads, and customer preferences.

-------------------------------------------
How to Renew?
-------------------------------------------

It’s easy to renew your membership! Simply:

1. Visit your membership dashboard on [ClickedArt.com](https://www.clickedart.com).
2. Select “Renew Membership” under your profile settings.
3. Complete the renewal process and continue enjoying your benefits.

-------------------------------------------
Act Now to Secure Your Benefits!
-------------------------------------------

Renew soon to ensure uninterrupted access to everything you love about ClickedArt.com.

If you have any questions or need assistance, please don’t hesitate to contact us at support@clickedart.com. We’re here to help!

Warm Regards,  
Team ClickedArt  
[www.clickedart.com](https://www.clickedart.com)  
support@clickedart.com  

P.S. Follow us on Instagram at https://www.instagram.com/clickedartofficial/ for updates, featured artwork, and more inspiring photos from our talented photographers!
    `,
    });
    return true;
  },
);

const sendPaymentInvoiceMail = asyncHandler(
  async (photographerName, email, s3Links) => {
    let attachments = [];

    // if (Array.isArray(s3Links) && s3Links.length > 0) {
    //   console.log(s3Links)
    //   for (let link of s3Links) {
    //     const response = await axios.get(link, { responseType: 'arraybuffer' });

    //     attachments.push({
    //       filename: 'invoice-details.pdf',
    //       content: response.data,
    //       contentType: 'application/pdf',
    //     });
    //   }
    // }

    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      cc: "finance@clickedart.com",
      subject: "Your Payment Invoice from ClickedArt.com",
      text: `
Dear ${photographerName},

Your Invoice is generated. Your payment will be credited in your A/C in next Payment cycle which is 1st week of every month

Here are the details of your payment:

________________________________________
Invoice Details:
• Invoice Link: [Click here to view your invoice](${s3Links})

________________________________________
What’s Next:
• The payment has been successfully processed and is now complete.  
• You can view your full payment details and download your invoice from the link above.  
• If you have any questions about this payment or need further assistance, please don’t hesitate to reach out to us.

Thank you once again for being part of the ClickedArt community. We are excited to see your continued success on our platform!

Warm Regards,  
Team ClickedArt.com  
www.clickedart.com  
support@clickedart.com

________________________________________
P.S. Stay connected with us on social media for the latest updates and featured artwork:
Instagram: https://www.instagram.com/clickedartofficial/
    `,
      // attachments,
    });

    return true;
  },
);

const sendStoryPublishedMail = asyncHandler(
  async (photographerName, email, storyTitle) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Your Story Has Been Published on ClickedArt.com!",
      text: `
  Dear ${photographerName},

  Great news!

  Your story, titled "${storyTitle}", has been successfully published on ClickedArt.com. We are delighted to feature your work and share your creativity with the world. Your story is now live and accessible to our global audience of art lovers and photography enthusiasts.

  Here’s what you can do next:

  1. Share Your Story:
     - Spread the word! Share your published story with your friends, family, and followers on social media.
     - Use the link to your story and inspire others with your journey and creativity.

  2. Engage with the Community:
     - Stay active and respond to comments or feedback on your story.
     - Interact with other photographers and art enthusiasts on ClickedArt.com.

  3. Keep Creating:
     - Don’t stop at one story. Continue submitting new work to grow your presence on ClickedArt.com.
     - Inspire, educate, and showcase your unique perspective to our vibrant community.

  Thank you for sharing your story with us and allowing us to highlight your talent. If you have any questions, need assistance, or wish to submit more stories, don’t hesitate to reach out to us at support@clickedart.com.

  Congratulations once again, and we can’t wait to see what you’ll create next!

  Warm Regards,  
  Team ClickedArt.com  
  www.clickedart.com  
  support@clickedart.com  
  Empowering Photographers Everywhere  

  P.S. Follow us on https://www.instagram.com/clickedartofficial/ for updates, featured stories, and more inspiring work from our talented photographers!
    `,
    });
    return true;
  },
);

// const sendWeeklyMailToInactivePhotographers = asyncHandler(async (photographerName, email) => {
//   const info = await transporter.sendMail({
//     from: `Clicked Art ${process.env.USER_EMAIL}`,
//     to: email,
//     subject: "Your ClickedArt Profile Is Waiting – Start Uploading Your Photos Today!",
//     text: `
//   Dear ${photographerName},

//   Thank you for registering on ClickedArt! Your profile is live,
//   but we noticed that you haven’t uploaded any photos yet.
//   Showcase your talent, reach a wider audience,
//   and start earning from your photography.
//   By uploading your images, you can:

//   ✔ Build your personal photography portfolio
//   ✔ Get discovered by buyers and art lovers
//   ✔ Monetize your work and earn fair royalties

//   Don’t wait—your journey with ClickedArt starts now!.
//   Upload your first photo today and make your mark in the
//   photography world.
//   Upload Now
//   Need help? We’re here for you! Reach out anytime.

//   Happy Clicking,
//   Team ClickedArt
//   📸 www.clickedart.com

//     `,
//   });
//   return true;
// })

// const sendWeeklyMailToNonMonetizedPhotographers = asyncHandler(async (photographerName, email) => {
//   const info = await transporter.sendMail({
//     from: `Clicked Art ${process.env.USER_EMAIL}`,
//     to: email,
//     subject: "Monetize Your ClickedArt Profile & Start Earning Today!",
//     text: `
// Dear ${photographerName},

// We noticed that you’ve registered on ClickedArt, but your profile isn’t monetized yet! Don’t miss the opportunity to showcase your incredible work and start earning from your photography.

// By monetizing your profile, you can:

//   ✔ Sell your high-resolution images to a global audience
//   ✔ Set your own pricing and earn fair royalties
//   ✔ Get featured in our premium photography marketplace
//   It only takes a few minutes to activate monetization and unlock new earning possibilities. Click below to get started:

// Monetize My Profile Now

// Need help? Feel free to reach out to our support team—we’re happy to assist!

// Happy Clicking,
// Team ClickedArt
// 📸 www.clickedart.com

//     `,
//   });
//   return true;
// })

const sendWeeklyMailToInactivePhotographers = asyncHandler(
  async (photographerName, email) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject:
        "Your ClickedArt Profile Is Waiting – Start Uploading Your Photos Today!",
      html: `
      <p>Dear ${photographerName},</p>

      <p>Thank you for registering on ClickedArt! Your profile is live, 
      but we noticed that you haven’t uploaded any photos yet.</p>

      <p>Showcase your talent, reach a wider audience, and start earning from your photography. 
      By uploading your images, you can:</p>

      <ul>
        <li>✔ Build your personal photography portfolio</li>
        <li>✔ Get discovered by buyers and art lovers</li>
        <li>✔ Monetize your work and earn fair royalties</li>
      </ul>

      <p>Don’t wait—your journey with ClickedArt starts now!</p>
      <p>Upload your first photo today and make your mark in the photography world.</p>

      <p>
        <a href="https://www.clickedart.com/upload" target="_blank" 
        style="display: inline-block; padding: 10px 20px; color: #007bff; 
        text-decoration: none; border: 2px solid #007bff; border-radius: 5px; 
        font-weight: bold;">Upload Now</a>
      </p>

      <p>Need help? We’re here for you! Reach out anytime.</p>

      <p>Happy Clicking,<br>
      <strong>Team ClickedArt</strong> 📸<br>
      <a href="https://www.clickedart.com" target="_blank">www.clickedart.com</a></p>
    `,
    });

    return true;
  },
);

const sendWeeklyMailToNonMonetizedPhotographers = asyncHandler(
  async (photographerName, email) => {
    const info = await transporter.sendMail({
      from: `Clicked Art ${process.env.USER_EMAIL}`,
      to: email,
      subject: "Monetize Your ClickedArt Profile & Start Earning Today!",
      html: `
      <p>Dear ${photographerName},</p>

      <p>We noticed that you’ve registered on ClickedArt, but your profile isn’t monetized yet! Don’t miss the opportunity to showcase your incredible work and start earning from your photography.</p>

      <p><strong>By monetizing your profile, you can:</strong></p>
      <ul>
        <li>✔ Sell your high-resolution images to a global audience</li>
        <li>✔ Set your own pricing and earn fair royalties</li>
        <li>✔ Get featured in our premium photography marketplace</li>
      </ul>

      <p>It only takes a few minutes to activate monetization and unlock new earning possibilities. Click below to get started:</p>

      <p>
        <a href="https://www.clickedart.com/profile" target="_blank" 
        style="display: inline-block; padding: 10px 20px; color: #007bff; 
        text-decoration: none; border: 2px solid #007bff; border-radius: 5px; 
        font-weight: bold;">Monetize My Profile Now</a>
      </p>

      <p>Need help? Feel free to reach out to our support team—we’re happy to assist!</p>

      <p>Happy Clicking,<br>
      <strong>Team ClickedArt</strong> 📸<br>
      <a href="https://www.clickedart.com" target="_blank">www.clickedart.com</a></p>
    `,
    });

    return true;
  },
);

const sendStoreUserWelcomeEmail = asyncHandler(
  async ({ name, email, tempPassword, loginUrl }) => {
    const targetLoginUrl =
      loginUrl || process.env.CLIENT_URL || "https://www.clickedart.com/signin";

    const textContent = `Hello ${name || "Customer"},

Your ClickedArt account has been created successfully.

Login Email: ${email}
Temporary Password: ${tempPassword}

Login here: ${targetLoginUrl}

For security, please change your password after your first login.

Regards,
Team ClickedArt
www.clickedart.com
support@clickedart.com
Empowering Photographers Everywhere
`;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded: 8px;">
        <h2 style="color: #0f172a; margin-top: 0;">Your ClickedArt Account Has Been Created</h2>
        <p>Hello <strong>${name || "Customer"}</strong>,</p>
        <p>Your ClickedArt account has been created successfully from our store.</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0 0 8px 0;"><strong>Login Email:</strong> ${email}</p>
          <p style="margin: 0;"><strong>Temporary Password:</strong> <code style="font-size: 16px; font-weight: bold; background: #e0e7ff; color: #3730a3; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
        </div>

        <p style="margin: 24px 0;">
          <a href="${targetLoginUrl}" target="_blank" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Login to Your Account
          </a>
        </p>

        <p style="font-size: 13px; color: #64748b;">
          <strong>Security Notice:</strong> For security reasons, please change your temporary password after your first login.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

        <p style="font-size: 13px; color: #64748b; margin: 0;">
          Warm Regards,<br />
          <strong>Team ClickedArt</strong><br />
          <a href="https://www.clickedart.com" target="_blank" style="color: #4f46e5;">www.clickedart.com</a> | support@clickedart.com<br />
          <em>Empowering Photographers Everywhere</em>
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `Clicked Art <${process.env.USER_EMAIL}>`,
      to: email,
      subject: "Your ClickedArt Account Has Been Created",
      text: textContent,
      html: htmlContent,
    });

    return true;
  },
);

module.exports = {
  sendResetEmail,
  verifyTransporter,
  sendVerificationEmail,
  sendApprovedMail,
  sendRejectionEmail,
  sendApprovedImageMail,
  sendUnapprovedImageMail,
  sendMonetizationMail,
  sendMonetizationDisApprovalMail,
  setApprovedImageOfMonetizedProfile,
  setApprovedImageOfNonMonetizedProfile,
  sendUnapprovedImageMailOfMonetizedProfile,
  sendEventSubmissionConfirmation,
  sendUnapprovedImageMailOfNonMonetizedProfile,
  sendMembershipUpgradeMail,
  sendOrderThankYouMail,
  sendMembershipRenewalReminderMail,
  sendPaymentInvoiceMail,
  sendStoryPublishedMail,
  sendWeeklyMailToInactivePhotographers,
  sendWeeklyMailToNonMonetizedPhotographers,
  sendStoreUserWelcomeEmail,
};
