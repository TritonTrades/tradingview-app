import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { prisma } from "@/lib/prisma";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  let browser;
  
  try {
    const { tradingviewUsername, whopUserId } = await req.json();

    if (!tradingviewUsername || !whopUserId) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user already has access
    const existingAccess = await prisma.tradingViewAccess.findUnique({
      where: { whopUserId }
    });

    if (existingAccess && existingAccess.active) {
      return NextResponse.json(
        { success: false, error: "You already have access with username: " + existingAccess.tradingviewUsername },
        { status: 400 }
      );
    }

    const sessionId = process.env.TRADINGVIEW_SESSION_ID;
    const sessionIdSign = process.env.TRADINGVIEW_SESSION_ID_SIGN;
    const scriptId = process.env.TRADINGVIEW_SCRIPT_ID;

    if (!sessionId || !sessionIdSign || !scriptId) {
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    console.log("Adding user:", tradingviewUsername);

    // Railway-compatible Puppeteer launch
    browser = await puppeteer.launch({
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
        value: sessionId,
        domain: ".tradingview.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
      {
        name: "sessionid_sign",
        value: sessionIdSign,
        domain: ".tradingview.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      }
    );

    const scriptUrl = `https://www.tradingview.com/script/${scriptId}/`;
    console.log("1. Going to script page...");
    await page.goto(scriptUrl, { waitUntil: "networkidle2" });
    await delay(3000);

    console.log("2. Opening modal...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
      const manageBtn = buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('manage') && (text.includes('access') || text.includes('invite'));
      });
      if (manageBtn) (manageBtn as HTMLElement).click();
    });

    await delay(2000);

    console.log("3. Clicking 'Add new users' tab...");
    await page.evaluate(() => {
      const modal = document.querySelector('dialog, [role="dialog"]');
      if (!modal) return;
      
      const elements = Array.from(modal.querySelectorAll('button, a, span, [role="tab"]'));
      const addNewUsersElement = elements.find(el => {
        const text = el.textContent?.toLowerCase() || '';
        return text.includes('add new users');
      });
      
      if (addNewUsersElement) {
        (addNewUsersElement as HTMLElement).click();
      }
    });

    await delay(2000);

    console.log("4. Typing username...");
    await page.evaluate((username) => {
      const modal = document.querySelector('dialog, [role="dialog"]');
      if (!modal) return false;
      
      const inputs = Array.from(modal.querySelectorAll('input')).filter(inp => {
        const style = window.getComputedStyle(inp);
        return style.display !== 'none' && inp.type !== 'hidden';
      });
      
      if (inputs.length === 0) return false;
      
      const input = inputs[0] as HTMLInputElement;
      input.focus();
      input.value = username;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, tradingviewUsername);

    console.log("✓ Typed username");
    await delay(2500);

    console.log("5. Clicking 'Add access'...");
    await page.waitForFunction(
      () => {
        const modal = document.querySelector('dialog, [role="dialog"]');
        if (!modal) return false;
        const allElements = Array.from(modal.querySelectorAll('*'));
        return allElements.some(el => el.textContent?.trim() === 'Add access');
      },
      { timeout: 5000 }
    );
    
    await page.evaluate(() => {
      const modal = document.querySelector('dialog, [role="dialog"]');
      if (!modal) return false;
      
      const allElements = Array.from(modal.querySelectorAll('*'));
      const addAccessElement = allElements.find(el => 
        el.textContent?.trim() === 'Add access' && el.children.length === 0
      );
      
      if (addAccessElement) {
        (addAccessElement as HTMLElement).click();
        return true;
      }
      return false;
    });

    console.log("✓ Clicked 'Add access'");
    await delay(2000);

    console.log("6. Clicking 'Apply'...");
    await page.waitForFunction(
      () => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(btn => btn.textContent?.trim() === 'Apply');
      },
      { timeout: 5000 }
    );
    
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const applyButton = buttons.find(btn => btn.textContent?.trim() === 'Apply');
      
      if (applyButton) {
        (applyButton as HTMLButtonElement).click();
        return true;
      }
      return false;
    });

    console.log("✓ Clicked 'Apply'");
    await delay(3000);

    await browser.close();

    // Save to database
    await prisma.tradingViewAccess.upsert({
      where: { whopUserId },
      create: {
        whopUserId,
        whopMembershipId: whopUserId,
        tradingviewUsername,
        active: true,
      },
      update: {
        tradingviewUsername,
        active: true,
        grantedAt: new Date(),
      },
    });

    console.log("✅ Saved to database");

    return NextResponse.json({
      success: true,
      message: `✅ Access granted to ${tradingviewUsername}!`,
    });

  } catch (error) {
    console.error("Error:", error);
    if (browser) await browser.close();
    
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}