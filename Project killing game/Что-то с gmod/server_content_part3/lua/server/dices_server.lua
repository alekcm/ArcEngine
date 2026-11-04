GM = GM or GAMEMODE

util.AddNetworkString("SendDiceToServer")



net.Receive ("SendDiceToServer", function(len,ply)
	local tbl = net.ReadTable()
	local randNumber = 0
	local advantage = ""
	local typeOfDice = ""
	local clr = Color(255, 248, 130)
	local Normalclr = Color(255, 248, 130)
	local Advclr = Color(255, 248, 130)
	if tbl[3] == "advantage" then
		advantage = " [Преимущество]"
		Advclr = Color(255, 151, 227)
	elseif tbl[3] == "disadvantage" then
		advantage = " [Помеха]"
		Advclr = Color(255, 173, 66)
		--Advclr = Color(255, 109, 109)
	end
	if tbl[1] == "str" then
		typeOfDice = " (Cила)"
		tbl[2] = tbl[2] + ply:GetNWFloat("StrDiceAdd")
		clr = Color(255, 109, 109)
		--clr = Color(255, 173, 66)
	elseif tbl[1] == "dex" then
		typeOfDice = " (Ловкость)"
		tbl[2] = tbl[2] + ply:GetNWFloat("DexDiceAdd")
		clr = Color(116, 255, 97)
	elseif tbl[1] == "int" then
		typeOfDice = " (Интеллект)"
		tbl[2] = tbl[2] + ply:GetNWFloat("IntDiceAdd")
		clr = Color(138, 243, 255)
	end
	local Say = {}
	table.Add(Say, {Normalclr, ply:Nick() .. " выпало число: " .. tbl[2],clr, typeOfDice, Advclr ,advantage} )
	if ply:Name() == "Кёко" and tbl[1] ~= "int" then
		Say = {}
		table.Add(Say, {Normalclr, ply:Nick() .. " выпало число: " .. math.random(20,80),clr, typeOfDice, Advclr ,advantage} )
	end
	if ply:Name() == "Шобай" and tbl[1] ~= "int" then
		Say = {}
		if math.random(1,100)<=25 then
			table.Add(Say, {Normalclr, ply:Nick() .. " выпало число: " .. 0 .. " сустав хрустнул",clr, typeOfDice, Advclr ,advantage} )
		else
			table.Add(Say, {Normalclr, ply:Nick() .. " выпало число: " .. tbl[2],clr, typeOfDice, Advclr ,advantage} )
		end
	end
for k, v in ipairs( player.GetAll() ) do
			if (ply:GetPos():Distance(v:GetPos()))<500 or (tbl[1] == "int" and v:IsSuperAdmin()) then
				net.Start("SendLocalMessage")
                net.WriteTable(Say)
                net.Send(v)
			end
		end
end)

print("dices_server load")