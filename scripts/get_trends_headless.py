import os
import time
import json
import glob
import random
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium_stealth import stealth

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
    print(f"🚀 Starting STEALTH scraper for '{KEYWORD}'...")

    chrome_options = Options()
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    # Note: selenium-stealth handles the user-agent, but setting a default helps
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
    
    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "directory_upgrade": True
    }
    chrome_options.add_experimental_option("prefs", prefs)
    # Hide automation control flag
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)

    driver = None
    try:
        try:
            driver = webdriver.Chrome(options=chrome_options)
        except:
            print("⚠️ Using webdriver_manager fallback...")
            from webdriver_manager.chrome import ChromeDriverManager
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=chrome_options)

        # --- APPLY STEALTH SETTINGS ---
        # This overrides JS variables that usually give away the bot
        stealth(driver,
            languages=["en-US", "en"],
            vendor="Google Inc.",
            platform="Win32",
            webgl_vendor="Intel Inc.",
            renderer="Intel Iris OpenGL Engine",
            fix_hairline=True,
        )

        url = f"https://trends.google.com/trends/explore?date={TIMEFRAME.replace(' ', '%20')}&geo={GEO}&q={KEYWORD}"
        print(f"🔗 Navigating to: {url}")
        
        # Random sleep before load to mimic human
        time.sleep(random.uniform(1, 3))
        driver.get(url)

        print(f"📄 Page Title: {driver.title}")

        # Check for immediate block
        if "Error" in driver.title or "429" in driver.page_source:
            # If blocked, we try a backup strategy: Go Home first, then search
            print("⚠️ Direct link blocked. Trying Homepage navigation strategy...")
            driver.delete_all_cookies()
            time.sleep(5)
            driver.get("https://trends.google.com/trends/")
            time.sleep(3)
            # Now try the link again
            driver.get(url)
            
        wait = WebDriverWait(driver, 15)
        
        # Cookie Banner
        try:
            cookie_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.cookieBarConsentButton")))
            cookie_btn.click()
            print("🍪 Cookie banner clicked")
            time.sleep(2)
        except:
            pass

        print("⏳ Waiting for chart...")
        
        # Download Button
        download_button_xpath = "(//button[.//i[text()='file_download']])[1]"
        btn = wait.until(EC.element_to_be_clickable((By.XPATH, download_button_xpath)))
        
        # Human-like pause
        time.sleep(random.uniform(2, 4))
        
        print("✅ Found download button. Clicking...")
        driver.execute_script("arguments[0].click();", btn)
        
        # Wait for download
        time.sleep(10)
        
        files = glob.glob(os.path.join(DOWNLOAD_DIR, "*.csv"))
        if not files:
            print(f"📂 Dir content: {os.listdir(DOWNLOAD_DIR)}")
            # Dump debug info
            timestamp = int(time.time())
            driver.save_screenshot(f"debug_screenshot_{timestamp}.png")
            raise Exception("No CSV found after click")
        
        csv_path = files[0]
        print(f"✅ CSV Downloaded: {csv_path}")

        # Convert
        print("🔄 Converting to JSON...")
        json_output = []
        
        with open(csv_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for line in lines:
            parts = line.strip().split(',')
            if len(parts) >= 2:
                date_str = parts[0]
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
            raise Exception("CSV parsed but empty!")

        with open(OUTPUT_JSON, 'w') as f:
            json.dump(json_output, f, indent=2)
            
        print(f"🎉 Success! Saved {len(json_output)} records.")

    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")
        if driver:
            timestamp = int(time.time())
            driver.save_screenshot(f"debug_screenshot_{timestamp}.png")
            with open(f"debug_page_{timestamp}.html", "w", encoding="utf-8") as f:
                f.write(driver.page_source)
        exit(1)

    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    scrape_trends()