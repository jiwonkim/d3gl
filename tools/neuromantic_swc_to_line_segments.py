import sys
import json

"""
Converts
"""
class Node:

	def __init__(self, x, y, z, t, parentIdx):
		self.x = x
		self.y = y
		self.z = z
		self.t = t # type
		self.parentIdx = parentIdx # idx for parent node
		self.children = []
	
	def addChild(self, childIdx):
		self.children.append(childIdx)
	
	@staticmethod
	def emptyNode():
		return Node(0, 0, 0, 0, 0)

def readNeuromanticSWC(filename):
	#swc = open('../models/brains/02a_pyramidal2aFI.CNG.swc');
	swc = open(filename, 'r');
	nodes = [Node.emptyNode()]
	for line in swc:
		if line[0] == '#':
			continue
		
		elems = [float(x) for x in line.split(' ')]
		if elems[0] == '':
			elems.pop(0)

		root = int(elems[-1])
		node = Node(elems[2], elems[3], elems[4], elems[1], root)
		if root > 0:
			nodes[root].addChild(len(nodes))

		nodes.append(node)	

	return nodes

"""
	output JSON:
	[
		// line 1
		{
			'level': <int>,
			'vertices': [
				x, y, z,
				x, y, z,
				x, y, z,
				...
			]
		},
		...
	]
"""
def buildJSON(nodes, root):
	def addVertex(line, node):
		line.append(node.x)
		line.append(node.y)
		line.append(node.z)

	lines = []
	growingBranches = [{'level': 0, 'node': root, 'branch': []}]	
	while growingBranches:
		growingBranch = growingBranches.pop(0)
		level = growingBranch['level']
		node = growingBranch['node']
		branch = growingBranch['branch']

		addVertex(branch, node)
		if len(node.children) == 1:
			growingBranches.append({
				'level': level,
				'node': nodes[node.children[0]],
				'branch': branch
			})
			continue

		# Only add branch if there is more than one vertex
		if len(branch) > 3:
			lines.append({
				'level': level,
				'vertices': branch
			})
			print "Added branch ", len(lines) - 1

		if len(node.children) == 0:
			continue

		for childIdx in node.children:
			child = nodes[childIdx]
			growingBranches.append({
				'level': level + 1,
				'node': child,
				'branch': [node.x, node.y, node.z]
			})

	return lines


if __name__=="__main__":
	nodes = readNeuromanticSWC(sys.argv[1])
	lines = buildJSON(nodes, nodes[1])

	savefile = open(sys.argv[2], 'w')
	json.dump(lines, savefile)
