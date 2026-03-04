#!/usr/bin/env python3
"""Extract VBA macros from Excel file"""
from oletools.olevba import VBA_Parser
import sys

excel_file = r'd:\sparco\assets\ScaleSoftPitzer Bangka Outlet Hydrocyclone-Mei - Copy 1 - Copy (2).xlsm'

try:
    vbaparser = VBA_Parser(excel_file)
    print("=" * 80)
    print("EXTRACTING VBA MACROS")
    print("=" * 80)
    
    for (filename, stream_path, vba_filename, vba_code) in vbaparser.extract_all_macros():
        print("\n" + "=" * 80)
        print(f"File: {filename}")
        print(f"Stream: {stream_path}")
        print(f"VBA Filename: {vba_filename}")
        print("=" * 80)
        print(vba_code)
        print("\n")
    
    vbaparser.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()

