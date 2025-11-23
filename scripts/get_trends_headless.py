import os
import time
import json
import random
import re
from datetime import datetime
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
# CHANGED: Fetch 5 years to cover 2022/2023 data
TIMEFRAME = "today 5-y" 
OUTPUT_JSON = "public/btc_google_trends.json" 

if not os.path.exists("public"):
    os.makedirs("public")

def parse_google_date(date_text):
    # Normalize string
    clean_text = date_text.replace('\u202a', '').replace('\u202c', '').replace('\xa0', ' ').strip()
    
    # PATTERN 1: Simple Date "Nov 17, 2024"
    try:
        return datetime.strptime(clean_text, "%b %d, %Y")
    except:
        pass

    # PATTERN 2: Date Range "Nov 17 – 23, 2024"
    try:
        # Extract year (last 4 digits)
        year_match = re.search(r'(\d{4})$', clean_text)
        if not year_match:
            return None
        year = year_match.group(1)

        # Extract the first Month and Day
        start_date_match = re.match(r'([A-Za-z]+)\.?\s+(\d+)', clean_text)
        if start_date_match:
            month_str = start_date_match.group(1)
            day_str = start_date_match.group(2)
            full_date_str = f"{month_str} {day_str} {year}"
            return datetime.strptime(full_date_str, "%b %d %Y")
    except:
        pass
        
    return None

def scrape_trends():
    print(f"🚀 Starting 5-YEAR scraper for '{KEYWORD}'...")

    chrome_options = Options()
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    
    prefs = {"profile.managed_default_content_settings.images": 2}
    chrome_options.add_experimental_option("prefs", prefs)
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
        driver.get(url)
        
        wait = WebDriverWait(driver, 15)
        
        # 429 Check
        if "Error" in driver.title or "429" in driver.page_source:
            print("⚠️ 429 detected. Pausing and retrying...")
            time.sleep(5)
            driver.get(url)

        # Cookie Banner
        try:
            cookie_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.cookieBarConsentButton")))
            cookie_btn.click()
            print("🍪 Cookies accepted")
        except:
            pass

        print("⏳ Waiting for chart data...")
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "line-chart-directive")))
        
        # Grab rows from the hidden table
        rows = driver.find_elements(By.CSS_SELECTOR, "line-chart-directive table tbody tr")
        
        if not rows:
            print("❌ Table not found in DOM.")
            print(f"Page source: {driver.page_source[:500]}")
            raise Exception("Table missing")

        print(f"✅ Found {len(rows)} weekly data points")
        
        json_output = []
        parse_errors = 0
        
        for i, row in enumerate(rows):
            cols = row.find_elements(By.TAG_NAME, "td")
            if len(cols) >= 2:
                date_text = cols[0].get_attribute("textContent").strip()
                val_text = cols[1].get_attribute("textContent").strip()
                
                if i == 0:
                    print(f"🔎 SAMPLE ROW: '{date_text}' = '{val_text}'")

                dt = parse_google_date(date_text)
                
                if dt:
                    try:
                        if "<" in val_text: val = 0.5
                        else: val = float(val_text)
                            
                        json_output.append({
                            "date": dt.strftime("%Y-%m-%d"),
                            "bitcoin": val
                        })
                    except ValueError:
                        parse_errors += 1
                else:
                    parse_errors += 1

        if not json_output:
            raise Exception(f"Failed to parse rows. Errors: {parse_errors}")

        with open(OUTPUT_JSON, 'w') as f:
            json.dump(json_output, f, indent=2)
            
        print(f"🎉 Success! Saved {len(json_output)} records (2020-Present).")

    except Exception as e:
        print(f"❌ ERROR: {e}")
        if driver:
            timestamp = int(time.time())
            driver.save_screenshot(f"debug_screenshot_{timestamp}.png")
        exit(1)

    finally:
        if driver:
            driver.quit()

if __name__ == "__main__":
    scrape_trends()