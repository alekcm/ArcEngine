GM = GM or GAMEMODE

local Chars = {{},{},{},{}}
local final
local ui


local function SetColor(first,col)
    first:SetImageColor(Color(255-154*(col/50),255-143*(col/50),255,255))
    timer.Simple(0.01, function()
            if col < 50 then
    SetColor(first,col+1)
                end
            end)
    end

local function DeadByDead(chars, i, des,ed, count, deadbyonetime)
    local j = 0
   -- if i < 17 then
  --  	surface.PlaySound("dead/minusone7.mp3")
   -- end
	while i < 17 do
		if chars[2][i] ~= nil then
            SetColor(chars[1][i], 0)
                    
            --chars[1][i]:ColorTo(Color(101, 112, 255, 255), 0.5, 0, function()
			--chars[2][i]:AlphaTo(255, 0.5, 0, function ()       
			
			count = count - 1
			if count == 9 then
				des:AlphaTo(0, 0.375, 0, function ()
					des:SetImage("materials/sprites/UI/voting/numbers/0.png")
					des:AlphaTo(255, 0.375, 0, function ()
					end)
				end)
			end
			ed:AlphaTo(0, 0.375, 0, function ()
				local sc = count%10
				ed:SetImage("materials/sprites/UI/voting/numbers/".. sc .. ".png")
				ed:AlphaTo(255, 0.375, 0, function ()
				end)
			end)
    		j = j + 1
                --if deadbyonetime == 1 then
            --surface.PlaySound("dead/minusone7.mp3")
           -- else
            if j == 1 then
            surface.PlaySound("dead/minusone7.mp3")
                end
    		if j == deadbyonetime and i ~= 16 then
				timer.Simple(0.75, function ()
                	DeadByDead(chars, i+1, des, ed, count, deadbyonetime)
				end)
                 --surface.PlaySound("dead/minusone7.mp3")
        		break
			end

			
            if i == 16 then
                --surface.PlaySound("dead/minusone7.mp3")
                end
            
        end
    	i = i + 1
    end
end

local function EndOfChapter()
    local backUI = vgui.Create("DImage")
    ui = backUI
    ui:MakePopup()
    backUI:SetSize(ScrW(), ScrH())
    backUI:SetAlpha(0)
    backUI:SetImage("materials/sprites/ui/dead/UI2.png")
    des = vgui.Create("DImage",backUI)
    des:SetSize(100, 150)
    des:SetPos(ScrW()/2-20, 230)
    ed = vgui.Create("DImage",backUI)
    ed:SetSize(100, 150)
    ed:SetPos(ScrW()/2+40, 230)
    local count = 0
    
    local CurrentChars = 0
    for i = 1, 16 do
        if Chars[1][i] ~= "Empty" then
            CurrentChars = CurrentChars + 1
            end
        end
    
    for i = 1, CurrentChars do
        
        if Chars[2][i] == true or Chars[3][i] == true then
            count = count +1
        end
    end
                    local sc = count%10
                    local fr = (count - sc)/10
                    des:SetImage("materials/sprites/UI/voting/numbers/".. fr .. ".png")
                    ed:SetImage("materials/sprites/UI/voting/numbers/".. sc .. ".png")
    local chars = {{},{},{}}
        local DeadNow = 0
    for i = 1, CurrentChars do
            local charimg = vgui.Create("DImage", backUI)
            chars[1][i] = charimg
            charimg:SetSize(ScrW()/8, ScrW()/8 * 22/14)
            charimg:SetPos((ScrW()/17)*(i-1) + ((ScrW()/17)*((16-CurrentChars)/2)), ScrH()/2+100)
            charimg:SetImage("materials/sprites/ui/dead/chars/"..Chars[1][i]..".png")
            if Chars[2][i] == false and Chars[3][i] == false then
                charimg:SetImageColor(Color(101, 112, 255, 255))
            end
            if Chars[3][i] == true then
                local charimg2 = vgui.Create("DImage", charimg)
                charimg2:SetSize(ScrW()/8, ScrW()/8 * 22/14)
                charimg2:SetImageColor(Color(101, 112, 255, 255))
                charimg2:SetAlpha(0)
                charimg2:SetImage("materials/sprites/ui/dead/chars/"..Chars[1][i]..".png")
                chars[2][i] = charimg2
				DeadNow = DeadNow +1
            end
                if Chars[2][i] == false or Chars[3][i] == true then
                local charimg3 = vgui.Create("DImage", charimg)
                charimg3:SetSize(ScrW()/8, ScrW()/8 * 22/14)
                charimg3:SetImageColor(Color(0, 0, 0, 255))
                charimg3:SetAlpha(0)
                charimg3:SetImage("materials/sprites/ui/dead/chars/"..Chars[1][i]..".png")
                chars[3][i] = charimg3
            
            end
            charimg:SetAlpha(0)
        
    end
        local DeadTick = math.floor(DeadNow/4+0.9)
    local TBC = vgui.Create("DImage",backUI)
	if(final == false) then
    TBC:SetImage("materials/sprites/ui/dead/ToBeContinued2.png")
	else
	TBC:SetImage("materials/sprites/ui/dead/TheEnd.png")
	end
    TBC:SetAlpha(0)
    TBC:SetSize(ScrW()+90, ScrH())
    surface.PlaySound("dead/survivors.mp3")
    backUI:AlphaTo(255, 2, 0, function ()
        for i = 1,CurrentChars do
            chars[1][i]:AlphaTo(255, 4, 0, function ()
                end)
        end
        timer.Simple(5, function ()
            DeadByDead(chars, 1, des, ed, count, DeadTick)
            end)
     --[[   timer.Simple(8, function ()
            for i = 1,16 do
                    if chars[3][i] ~=nil then
            chars[3][i]:AlphaTo(255, 2, 0, function ()
                end)
        end
    end
            end)]]
        timer.Simple(10, function ()
            --[[for i = 1,16 do
            if chars[3][i] ~= nil then
                                chars[1][i]:AlphaTo(0, 2, 0, function ()
                                    end)
                            end
                        end]]
            TBC:AlphaTo(255, 2, 0, function ()
 
                timer.Simple(2, function ()
                        TBC:AlphaTo(0, 3, 0, function ()
                            end)
                        backUI:AlphaTo(0, 3, 0, function ()
                            end)
                        for i = 1,CurrentChars do
                                        
                            chars[1][i]:AlphaTo(0, 3, 0, function ()
                                end)
                            --end
                        end
                        timer.Simple(3, function ()
                            ui:Remove()
                            end)
                        end)
                end)
            end)
        end)

end



net.Receive("EndOfChapter2", function ()
    Chars = net.ReadTable()
	final = net.ReadBool()
    EndOfChapter()
    end)
print ('Dead People has been loaded')