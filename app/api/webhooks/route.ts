import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import puppeteer from "puppeteer";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Function to remove TradingView access
async function removeTradingViewAccess(tradingviewUsername: string) {
  const sessionId = process.env.TRADINGVIEW_SESSION_ID;
  const sessionIdSign = process.env.TRADINGVIEW_SESSION_ID_SIGN;
  const scriptId = process.env.TRADINGVIEW_SCRIPT_ID;

  // Railway-compatible Puppeteer launch
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-extensions'
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  await page.setCookie(
    {
      name: "sessionid",
      value: sessionId!,
      domain: ".tradingview.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
    {
      name: "sessionid_sign",
      value: sessionIdSign!,
      domain: ".tradingview.com",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    }
  );

  await page.goto(`https://www.tradingview.com/script/${scriptId}/`, { 
    waitUntil: "networkidle2" 
  });
  await delay(3000);

  // Open modal
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
    const manageBtn = buttons.find(btn => {
      const text = btn.textContent?.toLowerCase() || '';
      return text.includes('manage') && text.includes('access');
    });
    if (manageBtn) (manageBtn as HTMLElement).click();
  });

  await delay(2000);

  // Find and remove the user
  await page.evaluate((username) => {
    const modal = document.querySelector('dialog, [role="dialog"]');
    if (!modal) return false;
    
    // Look for the user in the list and click the X/remove button
    const userRows = Array.from(modal.querySelectorAll('[class*="row"], [class*="item"]'));
    const userRow = userRows.find(row => row.textContent?.includes(username));
    
    if (userRow) {
      // Find remove/delete button (usually an X or trash icon)
      const removeBtn = userRow.querySelector('button, [role="button"], svg');
      if (removeBtn) {
        (removeBtn as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, tradingviewUsername);

  await delay(2000);
  await browser.close();
}

export async function POST(req: NextRequest) {
  try {
    const event = await req.json();
    
    console.log("Webhook received:", event.action);

    // Verify webhook signature (important for production!)
    // const signature = req.headers.get("x-whop-signature");
    // Add signature verification here

    if (event.action === "membership.went_valid") {
      console.log("New membership activated:", event.data.user.id);
      // User will add their username through the app
    }

    if (event.action === "membership.went_invalid") {
      console.log("Membership expired/cancelled:", event.data.user.id);
      
      const userId = event.data.user.id;
      
      // Find the user's TradingView access
      const accessRecord = await prisma.tradingViewAccess.findUnique({
        where: { whopUserId: userId }
      });

      if (accessRecord && accessRecord.active) {
        console.log("Removing access for:", accessRecord.tradingviewUsername);
        
        try {
          // Remove from TradingView
          await removeTradingViewAccess(accessRecord.tradingviewUsername);
          
          // Mark as inactive in database
          await prisma.tradingViewAccess.update({
            where: { whopUserId: userId },
            data: { active: false }
          });
          
          console.log("✅ Access removed successfully");
        } catch (error) {
          console.error("Error removing access:", error);
        }
      }
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}