import os
import time
import json
import glob
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

# --- CONFIGURATION ---
KEYWORD = "bitcoin"
GEO = "US"
TIMEFRAME = "today 12-m" 
OUTPUT_JSON = "public/btc_google_trends.json" 
DOWNLOAD_DIR = os.path.join(os.getcwd(), "temp_downloads")

if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)
if not os.path.exists("public"):
    os.makedirs("public")

def scrape_trends():
    print(f"🚀 Starting HEADLESS scraper for '{KEYWORD}'...")

    chrome_options = Options()
    # Standard headless flags
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    # IMPORTANT: Use a real User-Agent to look less like a bot
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    
    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "directory_upgrade": True
    }
    chrome_options.add_experimental_option("prefs", prefs)

    driver = None
    try:
        try:
            driver = webdriver.Chrome(options=chrome_options)
        except:
            print("⚠️ Using webdriver_manager fallback...")
            from webdriver_manager.chrome import ChromeDriverManager
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)

        url = f"https://trends.google.com/trends/explore?date={TIMEFRAME.replace(' ', '%20')}&geo={GEO}&q={KEYWORD}"
        print(f"🔗 Navigating to: {url}")
        driver.get(url)

        # DEBUG: Print Title
        print(f"📄 Page Title: {driver.title}")

        wait = WebDriverWait(driver, 15)
        
        # 1. Check for "Too Many Requests" or generic Google errors
        if "Error" in driver.title or "429" in driver.page_source:
            raise Exception("Google blocked this IP (429/Error page)")

        # 2. Handle Cookie Banner (Critical in headless)
        try:
            # Try multiple selectors for different regions (EU vs US)
            cookie_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.cookieBarConsentButton")))
            cookie_btn.click()
            print("🍪 Cookie banner clicked")
            time.sleep(2) # Wait for fade out
        except:
            print("ℹ️ No cookie banner found (or already gone)")

        # 3. Wait for Chart
        print("⏳ Waiting for chart to render...")
        # Look for the specific export button container
        download_button_xpath = "(//button[.//i[text()='file_download']])[1]"
        
        try:
            btn = wait.until(EC.element_to_be_clickable((By.XPATH, download_button_xpath)))
            print("✅ Found download button. Clicking...")
            driver.execute_script("arguments[0].click();", btn)
        except Exception as e:
            # CRITICAL DEBUGGING SNAPSHOT
            print("❌ Could not find/click download button!")
            print(f"🔎 Current Page URL: {driver.current_url}")
            raise e

        # 4. Wait for File
        print("⬇️ Waiting for download...")
        time.sleep(10) # Give it extra time in CI
        
        files = glob.glob(os.path.join(DOWNLOAD_DIR, "*.csv"))
        if not files:
            print(f"📂 Directory contents: {os.listdir(DOWNLOAD_DIR)}")
            raise Exception("Download clicked but no CSV appeared.")
        
        csv_path = files[0]
        print(f"✅ CSV Downloaded: {csv_path}")

        # 5. Convert
        print("🔄 Converting to JSON...")
        json_output = []
        
        with open(csv_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for line in lines:
            parts = line.strip().split(',')
            if len(parts) >= 2:
                date_str = parts[0]
                # Google CSV format check: YYYY-MM-DD
                if len(date_str) == 10 and date_str.count('-') == 2:
                    try:
                        val = float(parts[1])
                        json_output.append({
                            "date": date_str,
                            "bitcoin": val
                        })
                    except ValueError:
                        continue

        if not json_output:
            raise Exception("CSV was empty or format changed!")

        with open(OUTPUT_JSON, 'w') as f:
            json.dump(json_output, f, indent=2)
            
        print(f"🎉 Success! Saved {len(json_output)} records.")

    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        
        # --- DEBUG ARTIFACT GENERATION ---
        if driver:
            timestamp = int(time.time())
            screenshot_path = f"debug_screenshot_{timestamp}.png"
            html_path = f"debug_page_{timestamp}.html"
            
            driver.save_screenshot(screenshot_path)
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(driver.page_source)
                
            print(f"📸 Screenshot saved: {screenshot_path}")
            print(f"📝 HTML dump saved: {html_path}")
            # Force exit with error to trigger GitHub Action failure
            exit(1)

    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    scrape_trends()