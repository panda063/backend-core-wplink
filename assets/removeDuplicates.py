'''
Removes duplicate cities
'''

import json
import os

filename = 'countries.min.json'

with open(filename, 'r') as f:
	data = json.load(f)
	for key in data.keys():
		tmp = set(data[key])
		if len(data[key]) != len(tmp):
			data[key] = list(tmp)

os.remove(filename)
with open(filename, 'w') as f:
	json.dump(data, f)




