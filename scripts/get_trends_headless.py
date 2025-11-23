import os
import time
import json
import random
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
TIMEFRAME = "today 12-m" 
OUTPUT_JSON = "public/btc_google_trends.json" 

# Ensure directories
if not os.path.exists("public"):
    os.makedirs("public")

def scrape_trends():
    print(f"🚀 Starting DIRECT-DOM scraper for '{KEYWORD}'...")

    chrome_options = Options()
    chrome_options.add_argument("--headless=new") 
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")
    
    # Hide automation flags
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

        # Apply Stealth
        stealth(driver,
            languages=["en-US", "en"],
            vendor="Google Inc.",
            platform="Win32",
            webgl_vendor="Intel Inc.",
            renderer="Intel Iris OpenGL Engine",
            fix_hairline=True,
        )

        # Navigate
        url = f"https://trends.google.com/trends/explore?date={TIMEFRAME.replace(' ', '%20')}&geo={GEO}&q={KEYWORD}"
        print(f"🔗 Navigating to: {url}")
        driver.get(url)
        
        # Wait for load
        wait = WebDriverWait(driver, 15)
        
        # Check for 429
        if "Error" in driver.title or "429" in driver.page_source:
            print("⚠️ Page error detected. Retrying via home...")
            time.sleep(2)
            driver.get("https://trends.google.com/trends/")
            time.sleep(2)
            driver.get(url)

        # Handle Cookies
        try:
            cookie_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "button.cookieBarConsentButton")))
            cookie_btn.click()
            print("🍪 Cookies accepted")
        except:
            pass

        print("⏳ Waiting for chart data...")
        
        # Wait for the Line Chart to appear
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "line-chart-directive")))
        
        # --- THE HACK: SCRAPE HIDDEN TABLE ---
        # Google renders an accessible table inside the SVG container for screen readers
        # We simply read this table instead of downloading a CSV.
        
        # Locate the table rows inside the chart
        rows = driver.find_elements(By.CSS_SELECTOR, "line-chart-directive table tbody tr")
        
        if not rows:
            raise Exception("Chart loaded but data table is missing!")

        print(f"✅ Found {len(rows)} data points in DOM table")
        
        json_output = []
        
        for row in rows:
            cols = row.find_elements(By.TAG_NAME, "td")
            if len(cols) >= 2:
                date_text = cols[0].text.strip() # e.g. "Nov 17, 2024"
                val_text = cols[1].text.strip()  # e.g. "100"
                
                try:
                    # Convert Date "Nov 17, 2024" -> "2024-11-17"
                    # Note: Google Trends date format might vary by locale (we forced en-US in stealth)
                    # Remove any LTR marks if present
                    clean_date = date_text.replace('\u202a', '').replace('\u202c', '')
                    
                    dt = datetime.strptime(clean_date, "%b %d, %Y")
                    date_str = dt.strftime("%Y-%m-%d")
                    
                    val = float(val_text)
                    
                    json_output.append({
                        "date": date_str,
                        "bitcoin": val
                    })
                except Exception as e:
                    # print(f"Skipping row: {date_text} - {e}")
                    continue

        if not json_output:
            raise Exception("Failed to parse any rows from the table")

        # Save
        with open(OUTPUT_JSON, 'w') as f:
            json.dump(json_output, f, indent=2)
            
        print(f"🎉 Success! Extracted {len(json_output)} records directly from page.")

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