util.AddNetworkString('GetChats1')
util.AddNetworkString('GetChats2')
util.AddNetworkString('GetChats3')
util.AddNetworkString('GetChats4')
util.AddNetworkString('AddNewChat')
util.AddNetworkString('AddNewMessage')
util.AddNetworkString('UpdateChat')
util.AddNetworkString('UpdateChatsList')
util.AddNetworkString('AddNewCharacterToChat')
util.AddNetworkString('PlayerLeaveChat')
util.AddNetworkString('RenameChat')

local chatList = {{["id"] = 1, ["Name"] = "Самый первый чат", ["Characters"] = {"Рантаро Амами1", "Чихиро Фуджисаки1", "Кайто Момота1"}, ["Messages"] = {{["Character"] = "Рантаро Амами",["Text"] = "Привет"},{["Character"] = "Чихиро Фуджисаки",["Text"] = "И тебе не хварать"},{["Character"] = "Server",["Text"]="Чихиро Фуджисаки удалил(а) Кайто Момота из чата"},{["Character"] = "Server",["Text"]="Кайто Момота был(а) добавлен(а) в чат"},{["Character"] = "Кайто Момота",["Text"]="Вы чё суки?!?!"}}},{["id"] = 2, ["Name"] = "Второй чат", ["Characters"] = {"Рантаро Амами1", "Кайто Момота1"}, ["Messages"] = {{["Character"] = "Рантаро Амами",["Text"] = "Кайто привет"},{["Character"] = "Кайто Момота",["Text"]="Привет, друг"}}}}
--chatList НЕ ЧИСТИТЬ, ДИАЛОГИ НЕ УДАЛЯТЬ!!!!
--Если chatList будет пустым на момент открытия монопада, то он сломается, поэтому оставляем эти. Их всё равно никто не видит.

local daylenght = 3600
local function GetTime()
	local time = math.floor(CurTime()) + 1200 
while time > daylenght do
	time = time - daylenght
end
return time
end

local function UpdateChat(id)
	--timer.Simple(5,function()
	--PrintTable(chatList)
	net.Start('UpdateChat')
	net.WriteFloat(id)
	net.WriteTable(chatList)
	net.Broadcast()
--end)
end
local function UpdateChatsList()
	--timer.Simple(10,function()
	net.Start('UpdateChatsList')
	--net.WriteFloat(id)
	net.WriteTable(chatList)
	net.Broadcast()
--end)
end

net.Receive("AddNewChat", function (len,ply )
	local tbl = net.ReadTable()
	tbl[1]["id"] = #chatList+1
	tbl[1]["Messages"] = {{["Character"] = "Server",["Text"]='Чат "'..tbl[1]["Name"]..'" был создан', ["Time"] = GetTime() }}
	table.Add(chatList, tbl)
	UpdateChatsList()
end)
net.Receive("AddNewCharacterToChat", function (len,ply )
	local id = net.ReadFloat()
	local tbl = net.ReadTable()
	table.Add(chatList[id]["Characters"], tbl[1]["Characters"])
	PrintTable(tbl)
	for i = 1, #tbl[1]["Characters"] do
	local newPlayerAddText = {{["Character"] = "Server",["Text"] = tbl[1]["Characters"][i].." был(а) добавлен(а) в чат", ["Time"] = GetTime()}}
	table.Add(chatList[id]["Messages"], newPlayerAddText)
	end
	PrintTable(chatList)
	UpdateChatsList()
	UpdateChat(id)
end)

net.Receive("RenameChat", function (len,ply )
	local id = net.ReadFloat()
	local name = net.ReadString()
	chatList[id]["Name"] = name
	local newPlayerAddText = {{["Character"] = "Server",["Text"] = ply:Name()..' изменил(а) название чата на "'..name..'"', ["Time"] = GetTime()}}
	table.Add(chatList[id]["Messages"], newPlayerAddText)
	UpdateChatsList()
	UpdateChat(id)
end)

net.Receive("PlayerLeaveChat", function (len,ply )
	local id = net.ReadFloat()
	local name = net.ReadString()
	table.RemoveByValue(chatList[id]["Characters"], name)
	local newPlayerAddText = {{["Character"] = "Server",["Text"] = name.." покинул(а) чат", ["Time"] = GetTime()}}
	table.Add(chatList[id]["Messages"], newPlayerAddText)
	UpdateChatsList()
	UpdateChat(id)
end)
net.Receive("AddNewMessage", function (len,ply )
	local id = net.ReadFloat()
	local tbl = net.ReadTable()
	tbl[1]["Time"] = GetTime()
	--PrintTable(tbl)

	table.Add(chatList[id]["Messages"],tbl)
	UpdateChatsList()
	UpdateChat(id)
end)

net.Receive("GetChats1",function(len,ply)
--[[	local localChatList = {}
	--PrintTable(chatList)
	for i = 1, #chatList do
		for k = 1, #chatList[i]["Characters"] do
			if ply:Name() == chatList[i]["Characters"][k] then
				table.Add(localChatList,chatList[i])
			end
			--print(chatList[i]["Characters"][k])
		end
	end--]]
	--PrintTable(localChatList)
	net.Start("GetChats2")
	net.WriteTable(chatList)
	net.Send(ply)
end)

net.Receive("GetChats3",function(len,ply)
--[[	local localChatList = {}
	--PrintTable(chatList)
	for i = 1, #chatList do
		for k = 1, #chatList[i]["Characters"] do
			if ply:Name() == chatList[i]["Characters"][k] then
				table.Add(localChatList,chatList[i])
			end
			--print(chatList[i]["Characters"][k])
		end
	end--]]
	--PrintTable(localChatList)
	net.Start("GetChats4")
	net.WriteTable(chatList)
	net.Send(ply)
end)
--local i = 2
--print(chatList[1]["id"])
--print(chatList["Chat"][1]["Messages"]["Character"][2])
--print(chatList[1]["Name"])
print("monochat_server loaded")