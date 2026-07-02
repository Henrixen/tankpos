import React, { useState, useEffect, useRef, useMemo } from "react";
import { C } from "./constants";
import { supabase } from "./supabaseclient";
import { classifyRegion, fmtDateShort } from "./utils";

// ─── Logo embedded as base64 so no /public file needed ───────────────────────
const STEEM_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABA8AAADKCAYAAADKKmnPAAAACXBIWXMAABcRAAAXEQHKJvM/AAAgAElEQVR4nO3d723byNbH8V8e7HunAALWvQVc+7IBKxXEW4EVELhv460gSgVx3i5AWK5glQpCN8C1t4BdGWABVgV+XvAoURxRFofD/98PYOwiNsnxiJI5Z86cefX09CQAAAAAAF4SB+EkytJV2+1A8/6v7QYAAAAAALovDsK5pH/abgfa8UvbDQAAAAAAdFcchKeSFpJOWm4KWkTmAQAAAABgpzgILyUlInAwemQeAAAAAAB+EAfha+XZBm9bbgo6guABAAAAAOAbW6awlHTcdlvQHSxbAAAAAABIkuIgnClfpkDgAD8g8wAAAAAAoDgIryS9b7sd6CaCBwAAAAAwYtQ3wCEIHgAAAADASFngIBG7KeAF1DwAAAAAgBEicIAyCB4AAAAAwMjYjgorETjAgQgeAAAAAMCIWOAgkXTUclPQIwQPAAAAAGAkCBzAFcEDAAAAABgBAgeoguABAAAAAAycFUdcisABHBE8AAAAAIAB29pV4djD6e49nAM9RPAAAAAAAAbK83aMN5KmHs6DHvql7QYAAAAAAGpzJT+Bg49Rls49nAc9RfAAAAAAAAYoDsK5pAsPp3oXZenCw3nQY6+enp7abgMAAAAAwKM4CGeSriueZi1pGmXpXfUWoe8IHgAAAADAgHjakpHAAX5A8AAAAAAABsIKJN6p2s4KBA7wE3ZbAAAAAIDhWIjAAWpA8AAAAAAABiAOwktJbyucgsABCrFsAQAAAAB6zuoc/FnhFAQOsBeZBwAAAADQY1bnYFnhFAQO8CKCBwAAAADQb3NVq3NA4AAvIngAAAAAAD0VB+FU0vsKp3hH4ACHIHgAAAAAAD1kyxUWFU7xMcrSKsdjRAgeAAAAAEA/zeW+XOFLlKVzf03B0BE8AAAAAICeqbhc4V7SzFtjMAoEDwAAAACgf64cj1tLmkVZ+uizMRg+ggcAAAAA0CNxEF5KOnE8/JICiXDx6unpqe02AAAAAAAOYEUSV5KOHA6/ibJ05rVBGA0yDwAAAACgP67kFjh4kHTpuS0YETIPAAAAAKAH4iCcSPrH8fA3UZYm/lqDsSHzAAAAAAD6YeF43GcCB6iK4AEAAAAAdJxtzXjmcOiDpLnXxmCUCB4AAAAAQPfNHY9jW0Z4QfAAAAAAADqsQtbBF5YrwBeCBwAAAADQbXPH49hdAd4QPAAAAACAjqqQdfAxytKV39ZgzAgeAAAAAEB3zR2OWUu68twOjBzBAwAAAADooDgIT+WWdTCnSCJ8I3gAAAAAAN3kUrPgIcpSsg7gHcEDAAAAAOiYOAgnki4cDp37bQmQ+6XtBgAAAAAYpzgIX0s6lbT57z53kh4l3Y0kJX/mcMxDlKWLQ36wZN+v7GssfV87K4TZq75/9fT01Ob10TNbHzKbD5qJfQFtu4yy9K6OE//7P/87FUWHJOnu779+r23Lp3//539XevkP6Bgs/v7r90Xbjdiwz/1z5Z/101Ybg0Mkyh8yl20/ZGK/OAjPVT4lvba/dU2xNfxT+zqVdOx4qgflwYREUtL3ftklDsKVyvfPb0VLFjz2/Vp5v98p/6wZXN/7Zlkk5/LT99v3fVK9dYcj8wAvsg+amfKb/aTVxgDFXtd8bpdiRSjHtSjU0CRtN0D6NiNyKelty01BOZv30HUchDeSrniw76y5yj9X1fm3rjZbz5Lnch80PXdsX2/tGg+SlpIWQ7jnLbhUtq/WkhbPzlNH3x8p7/e3kj7EQbjW975PPF2j9yxgcCn/fX9mX9t9v4yydOnpGoUIHmAnm2maKb/hfd3sAICOs8//uaT3LTcF1V1IuoiD8LOovN4pcRDONIIJGfs9L9XM73qs/HPrfRyE98oDZ4sGrluXmcMxV5v3ecN9f6TvnzcPyrM1F2P9zLG+n6mZCZHnfb/Q1n3gG8ED/CQOwrnyD5ujlpsCAGiQBQ4SjWBQMzLvJU3jIJyO9WG+S7YCdINkv9+l2n2WPFGefXOlfCA1b6kdTmzG2iXraxEH4abv25r8O5b0SdJ8q/9H8bljQYO52u37D5Iu6+p7dlvAN3EQTm1t1QcROACAUSFwMHgnkhJ7ndGuuQaa1WmDpzt151nySHlq98ra1hfnDsc8KP8M/6Ru3F9Hyu+DlQU0BisOwnMbQ12re30/93liggeQ9C3b4Ku6ccMDAJq3FIGDoTtR/jqjJVZLZHBLguIgnMRBmKg7g6fnjpVnIiQ2q991M4djNjUguuZI0qc4CO+s/sJg2H2/lPSHutv3m+DZ1McJCR5AcRAulEenAAAjZLNCFKsch7OhzwJ2lWV9DC54Y/fTnfrxGXIm6a7LWQg2wB5iIPdE0p++Z8LbYgUt79SPosLHkr7aUoZKCB6MnAUOLtpuBwCgHUNff42d5ixfaMVS3Ujl9yIOwtc26/pJ/fq9jpRnISw6+j6Ytd2Amn2wDJAu9v1BbPz0h/p130t5MdG7Ktk3BA9GjMABAED52tq+PQChmiO5ramGI3vm6sPM/EFsdjxRP2Zdi1yom3VApm03oAFnytfj92oZgwXM7tTv8dOJ8uybqcvBBA9GylLM+nzjAwD8mLXdALRi1nYDxmJoz1xbgYMhpNafqEODWJsRHkK/HuJIefBm2nZDDmH3yJ2G8focKV/GMCt7IMGDEbKb/1Pb7QAAdMJgZkNRCq97A+zhfDDPXFuBgyFlK20GsV0IIIwtI8h5ENukrfu+i0URq7gu2/cED8apcrEMAED/deRhGS3h9a+XPZRft90OX1oIHNzaVxO6EkDoSvBg0/frhq53bQUIO6fF+77Jvp8d+sO/1NgQdJClBvmebWjqgx3VvVb5dKu18jStrnus+dzc5/XfB324z5qwavBaLmt9+/KZsM3l717f3vMTlZ8V69pa78EgcFDKF+WfKYmkVZSlq4I2vJZ0al9T+/LZnk0AYRJlaZ3PFDvZ79d0RlBX+l6SFnEQTqMs7czfl60dUuq472+V93uiw/v+VPXUKbqOg/AxytIXd4N59fT05Pna6DLbg7fqB9MX5W+kpOhGR3fFQVj2Tf8xytJ5HW0B0C4LKH8teVjvPhMc/vbdRlk6rac19XB8Ld9EWZr4b8241Rw4aPw1s8FLIr9rvb9IWhwyWNnHZqvP5bemxL2kadMBBPtd/mjgUpvn+GWV33Gr730OZteSTrswvqjxvvfR96eSLuW/718M3pB5MCJ2o1UJHNxImnfhDQ0AANA1Q8s4MEv5G0B5fZa04MPSilJuvqoOpk6UL/GdVTxPWdOaz19X37+Wv74/Un6/tb18RMrvga7e93eSZnX0fRyEp/sCG9Q8GJeZ43Fr5ZHuGYEDAACAn9l2jIMKHMRBOJefVPovkv5V17NklKWPlhE1kfTZwykvWijiN63pvLfqV9+fxEHYan02e+19ZLM02fcfPZzyWNJi3w8QPBgXl0IkmxSWxHNbAAAAes/2fl9oQNsxSt8yVj9UPM1a0q9Rlp43MQFlg6lLSW8kPVQ83ZVtnVg7m0H2vQXgpu+nDff9f5Uv/ajifVtbONprXjV40Ubfz+Wn79/uC5wRPBgJeyO4bC8y61LhEgAAgK7YWhc9qMCBWVQ8/l75+vVKdQ1c2KTXqfKMB1dHqt4Hh5p6Pl+bfX+n/Pe5qXiqhb2/mrZQtSUArfZ9lKWnqt73V0V9T/BgPKYOx9y2ceMDAAB0nc3Mr+Q+Y1x1Zrw2VkOgykz4TZSlrRa+s9nYc1VLpT9raPmCzzX+X5RnDa88nrMU6/uZpN8qnOZY+Vr+xlgRyCrLdFrve0myvn9X4RRHKsi+IHgwHhOHY1pdbwQAANBFNqD8U9VmKGdeGuOZzTjOK5zixgYvnWCp9FUGUvMGZsCnns5zY0tEGt9qcpcoS69Ure8/NLV0xFQZ+3St7xeq1vcXu5aOEDwYj9IRTbIOAAAAfmTF3KoWRnzX4XpSVSq3dypwsGEDKdeCck3MgPvIPOhy31cK3vhpyX4WEHRZ4i2NqO8JHoxH2YjpbS2tAAAA6LeqA73P9lDfOVtbv7m47+IAasMKyrmuBb+sK/vAZtarbrN3r4ZT/Muw+9217y8ayj6YOx7Xh753Xbpz9jz7gOABAAAA0IyPlkbfVa5ZB2vVt9WgT5dyq0Z/JLddyw4xqXj8WlJn0uWLWGDJdSeAub+W/KxC1kFf+v5S7hPDP3xeETwAAAAA6vfOZr+7bOZ4XOcHUFJeyE/uv+PcX0t+MK14/KztAn0lnCsfcJd1UXPdCdeA3hj6/u125gfBAwAAAKA+a0lvurpUYcMqzbvMvt50uH7DT2wrQZf6B8e7Csh5MKlw7Jc+1Sizgfbc8fCZt4ZssV1TXHYW6VvfP6pCkGTzPwQPUKSNfVUBAACG5F751m1J2w05gEta/lodXu9dxDJAXLbKnPltiaRqwYM+9v2VutP3Vc7bx75fyG35wmzzPwQPxmNV8udPGtiWBgAAYKhulAcO7tpuyIFcggdXfViuUGDucEwddQ9cC3De9Chl/rm5wzEnNRVOdHlNx9b3x5ahQfBgRFYOx9RVGAYAAGCo1pJ+jbJ01peBtS1ZKFsocS3pqobmNMJmYcvOgB/VsHTBdaeFuc9GNMmx7yXPYxMbELss1Zn7bEeTLAvKpXDluUTwYExcot4z340AAAAYsFtJkz6thTZTh2OWfQmO7LFwOMbbAHYzm+ugzzPfGy6Bp6nnNric78uY+57gwXi4BA/OLBINAACAYmvluylMezqgdhnE9jbrYMvC4RjXAf8urkuE+xac2mXhcMzUcxtczrfw3IY2LFV+54UzieDBaFiEzCU9aEHtAwAAgEJflGcbLNpuSAVnJX/+oUe1HArZ83HZFO6yfbWPyzP2uoeZLT+xINuXkocdea57MC3580Pq+6TscXEQTgkejIvLzX4kKSGAAAAA8IMH5Vswnvc020CSc+p84rsdLSr9fOyx7oFL3/d+8LolcTjGS+aHjW3K1ptIfFy7I1zuo8kv3puBLltIeu9w3InyAMJsCFFmoKx//+d/U0lf225HB9z+/dfv07pO/u///C+R3xmdvvr491+/z9tuBIBCj5I+2nZ/QzBxOCbx3IY2JZI+lDxm4r8ZBxvSs3jicMyp/ARQxh40SxyOmZB5MCI28Hepril9DyDMyUIAAABjZZkG87bb4ZHLIGowA1irPl/WxHMzyhhS37v8LhNPl3c5z5D6fqXydQ9YtjBCVYrbHCmPzK7iILyqYasaAAAAdNwAM1HL1gWbeLpu6Qk5x2BHl5Wd2Jx4uq7LeYZ235f+fVi2MDJRli7iIJzLbU/TjSPlyx/ex0Eo5W/6ptf63dk17yStBvhHDAAAoAnTkj/vUoC761Yq92w88XTdslkfZWeK+6A39UL6XNukQNnf5zXBg3Gaye/67ROP5zrUD+uiLYhxq3wNVEIwAQAAoBarthswYkN8vl2pXL2jtpZPDzFodifpbYmfP2HZwghZutPntttRgzNJnyT9GQfhXRyEM+ozAAAA4AVDHJT3xarkz/uatJyW/PmVp+v2GsGD8ZrLvXhiH5xIulZen+Gy7cYAwIAMLW0TAPhcAw5A8GCkbM3OTMNcO7XtSNIny0Twsi8sAIwcM3QAhoZnxP7wNXYp+7eMbGYRPBg1qwsw1fADCNL3rSbP224IAAAAOqWtgWFS8ucnNbShbdOSP+8rgF0226SNGm91m5T8+QeCByM3sgDCkaQ/4iCctd0QAACAjig7GCtT3K4v+jKrXGW3NOC5ScmfXxE8wCaAcKph10DYds0SBgAAAEkO6/0HWJC6rVlll76f1NCONrX1TO7S99Ma2tGmSdkDCB5AkhRl6SrK0lNJH9tuS0OSAf7hAwAAKGvlcMxgJmFanlByScEfUt9PlGcGl5F4urxL3088Xbt1Ng4qm8ly90sdjUF/RVk6j4NwKelKw0xL2zhS/jvOWm4H+mGl8QTW9lnVfP6F/D0U9FnSdgMAjMrK4ZiphvNZ5TIYX3m6tst5ppKWnq7ftqnDMb52xlg5HDNV/qwyBFOHYx4JHuAnmzoIlppzKeltuy2qzUUchPMoS1dtNwTd9vdfv6+Ub2+KGv391++LttsAACPkMgN7ruH8XXQppr3yceEoS1dxEK5VbvZ96uPaHTF1OMZLwUTr+7KHTX1cuyOmDsckLFtAoShLkyhLzyX9S9Jvkr603KQ6zNtuAAAAQFts++6HkoedDGjt/bTl65cdDA+p70sHbqIsTTxe/7bkzx8PqG6aS9CMZQt4mc3MX9nXpljI5NlX0ybyU3H2PA7C1/aHEwAAYIwSSRcljzmXPRv2le3AVXbNveRvu0Ap7/uyS4Vn6vkEmG2fXrbvfRd3T+TW95ee29EoG8uVHUfdR1nKsgWU5zniV4nd/Of25RJMONKw1o4BAACUlah88OBSPQ8eyL32lc9Jp6WkDyWPmannwQO5DcATz21I5ND3tuy5zxOPM4djEondFtBztrTiMsrSiaTPjqeZ+msRAABA77hMohzb7HEv2QSUa3Hwla92WK2xsstGji1ropds2YVL33ud7LMJ0XXJw47klvLfCdb3ZQOFEsEDDE2UpZdyCyAMZe0SAABAaTaL6pISPvfclCbNXQ+sodh24nDM3HMbmuSSsbKuKfvZJSAx7/GW73OHY9ZRli4lggcYnrnKRxCHvCUlAADAIVwGdCd9nAGvmHXge9295Nb3x3EQ9m7tvfW9y05udS0xdsq6UQ/rHlixR5esg299RPAAg2KRc+oXAAAAlOP6/HTVp1lYa+uiwim8r3V3XLog5TPgE8/NqdvC8bha6mvYjHrZiUdJ+jCivv92HMEDDFHpCrg9fPMDAA53KelNia/ezSgBVdkEzI3DoUeqNhhv2pWq7diVeGrHc3OHY3rV93EQuvb9vQVY6uIamOjNhGUchHNJJw6H3m8vF2G3BQyRy4fLRB6L3wAAuqPmh05gSOZyS2t+GwfhZZSlnd59wZZYuPx+21bVW7LTUvkgtuz2hWdW/X/uv0n+WHHN946H131fLVR+1wUpX7ZzZXXXOsuWirj8ftKzvifzAAAAAMCmEKBL9oEkfery7gu23vvaw6lqCUZa5ofrIPlDl2tPWN8vHA9/iLLU9diDVLzv3/eg710zJH7qe4IHGCKX3RNWvhsBAADQQ/MKxy5ssNIp1qbEx7kaSJ93WX8vSdcd7/uyGRUbc2+Nefk6Vfp+5q8pftTR9wQPMESTsgfUsOUOAABA71SchT2SlFiadCd4GEBtu/VwjkKWfTCvcIqkS4NYD31/X3fWwYbd91WWR3QqgFBX3xM8wBB1NmUOAACgBy7lPgt7JOlrFwZS1oZEfgIHUk1LFrZZ3QjX7SCPlA9iW1+Db0tYElXr+6Z/jyu57XqxcW2FCVtlwbtENfQ9wQMMiv2RKFvFtdYoMgAAQJ/YDHjVgdt1HISLNrZxjIPwtVX2v5a/wIFU304Lz80qHv8pDsJlW1toWt//oWp9/3m7yn8T7L6fVTzNh5b7fi7pq2rqe4IHGAxLz3FJN6IKNwAAaFRbg4tDWcryl4qnuZB01+QyBrvWndwr+++T1HDOn1hdhY8VT/NWed83lpEbB+E0DkIfff+g5mod/MAGzZ8rnuatpFWT2TdxEJ5a37vuqrCxt+8JHmAQKqZGJV4bMzydK74DAPBi0nYDRq4Pf19nqpbGLeUZoV/jIEziIJxUblGBOAgncRAulM+6ls1CPcS9zUw3wrZerJodeyzpD+v7aeVGFXjW9yceTnneZF/vMJf70pGNzRKSpvr+TzXQ9wQP0FuWkjaLgzCRe2rUOspS1+1LxmLaxeq9AIDKqBHUrmnbDXiJDSJ83Sdnkv6xwZS3e89mu5eS/lGe6VCXpMZzFzmXe+2JbWf6HsDx3fcL+e37dzXvaPGireULvvt+5uF8kr5lGizUcN+/enp6evEsNnDodGoVBm+i7zMkE+XReh/RtZsoS2ceztMbltJUtu/WyveIXW19teGxjT8o//7P/16rHzNEdXv8+6/fa+v/f//nf/ytya3+/uv3VRMXstmQryUPe9P0OlS8zGZ0/3E49Fb5/usrj83Bfq+VDwpdHvhbef/ZoOfa82k3zxZLScmhM8223GNqX+eqJ8tgl1/bmHDyvFvERlf7vlPP5RZo+cPzaTd9nyjv+1WJ9kyV93trff/LSz9QU6cBXTFvuwEtcEkDO1K90fxD3aqdmZpTlR9gDVHd/X+lPEI/dh81zs8mVBBl6SoOQpdDz8T7Di+IsnRh95fPAMLm2eJCkuIgfFAexLrTz88qmyD+RM0FC55L2rholKV3FrzxOR7rYt93KnAgSVGWLuMgfKd67/u18n5faXcQd6r8NfAxaVrk4L7fGzywKPaienuATropE+0bkDvxoAgAQ/Sg9gZWaEZr6dwWQDhVPYUIpfzePVY3n1G+tLkGv6ZB7La2+75zgYONmgJn247UbhC3VN8X1jywtJSl/KbIAF2x1nhn9thdAgCGic/3YXtouYicoiy9lPSuzTa0JGm7Abb7xRD7vrOBgw36/rt9BROvVG96BNCm2UizDqQO/AEEANQiabsBqFXSdgOkQQ+k9ulEcW3r+zfyU8ivCzofONjYuu9H3fc7gwe2rqYL65uBOnwe8w4LFjSpuvUPAKB7Rvu3bSQ68/oOcBC7z32XJpysYOZU1bcSbNu7vgQONuy+n6r69qVtc+77n4IHtpbpqmqLgI66sZS7sVu03QAAgF82wLlpux2oxUPXJj5sEDvR8CckFm034DnbeWoq6UvLTXHxIOm/NhDvHev7U420738IHlDnAAP3sW8RzrrYh8bQ/9gDwBjNNY7Z4LGZt92AXaIsfYyydKp8l5ih3nedCtpsWN+fS/pV/en7z5JO29h226etvv9NI+v755kHC1GlF8OzVr4377zthnTMTP35wAMAHMCyD8iwG5bbrs/S2jPWqYY3MXHbpSULu1hGykTdzjp6kPQmytLLtot++hRl6ZW6n4Xgte+/BQ/iILyU9LbqCYGOuZE06VqqXxfYH8OpCCAAwKDYQPNj2+2AF/eSzttuxCGiLF1ZFsIbdSuI8KC80J1LmxZ+m1IPmwmfqaN9H2XpxJa5DI7d9+caSd//nyTFQTiV9MnXSYEOuJH0ryhLZ0OKcPq2tW6rSx92AICKbCa4T+nM+NmtpGnfnmOiLE06EkT4NnhSvo3pWcnj1+rokoUiz/q+zdnw7YHrosV2NKaL930dff/LVp0DoO++KL+Xl337Q9umTQaC7bJyKbZoBYBBiLJ0GQfhRPln+6WoadUXD5LmfR90bXYFsGLsM/uq+x7cDPgXz2ZbXZby9PZ50n73ZOv9f676l6YX9f2obN33Ew2w738RBRLRP2vlEeRH+28y5g8pX+whZWF/5Kf2NRHBBADoLRv8zCXN4yA8V/7ZfmpfPP91x63yZ5rl0J5pLMvxUtKlZTtv7kNfzxcPkhLlfffThKgN4ly2oF9UalUHbNVAudwK4kzVUN+P2VD7/tXT01NT1wIAAACAzS5vmwmLzf9LxcsL7pVPHK3sK5F091J2QByEC5UPHtxHWXr68o/1lwVyTpVPFL3U95s0/JVK9D12K+j7ooDurvt+1VYhT4IHAAAAAAbHAhQrlc+yedf3ZSNAHZ5v1QgAAAAAQ+BS66N3hRKBphA8AAAAADAoWwXryroiHR/YjeABAAAAgKGZy60o6JXndgCDQfAAAAAAwGBU2GHhhqwDoBjBAwAAAABDsnA8bu6xDcDgEDwAAAAAMAhxEJ6reMvBfW7a2v4O6AuCBwAAAAB6z7ZmdK1ZMPfYFGCQCB4AAAAAGIJLSccOx5F1AByA4AEAAACAXouD8FTSB4dD1yLrADgIwQMAAAAAfbdwPO6KrAPgMAQPAAAAAPRWHIRzSScOh67lXiMBGJ1XT09PbbcBAAAAAEqz5Qp/Oh7+LsrShcfmAING8AAAAABA79juCndyK5J4H2XpqecmAYPGsgUAAAAAfbSQW+BAyndmAFACwQMAAAAAvRIH4aWkt46H30RZmnhsDjAKBA8AAAAA9IbVOfjkePhaZB0ATggeAAAAAOiFOAgnkpIKp5hFWfropzXAuBA8AAAAANB5ViBxKenI8RRfoixdemwSMCoEDwAAAAD0wVLSieOxa0kzf00BxofgAQAAAIBOi4NwIemswilYrgBURPAAAAAAQGdZ4OCiwiluWK4AVEfwAAAAAEAn2ZaMVQIH92J3BcCLV09PT223AQAAAAB+EAfhTNJ1hVOsJU2jLL3z0yJg3Mg8AAAAANAplnFQJXAgSZcEDgB/fmm7AQAAAACw4aHGgZTXOVhUbw2ADZYtAAAAAOgET4GD+yhLTz00B8AWMg8AAAAAtCoOwteSrlQ9cLCWNK3cIAA/IXgAAAAAoDUWOEgknVQ81aZA4mPlRgH4CQUTAQAAALQiDsJTSStVDxxI0owCiUB9CB4AAAAAaJxtxZhIOvJwundRli49nAdAAYIHAAAAANowk5/AwUd2VgDqR/AAAAAAQF/dRFk6b7sRwBgQPAAAAADQRzdRls7abgQwFgQPAAAAAPQNgQOgYQQPAAAAAPQJgQOgBQQPAAAAAPQFgQOgJQQPAAAAAPTBOwIHQHsIHgAAAADoundsxwi065e2GwAAAAAABdaSplGW3rXdEGDsyDwAAAAA0EX3kk4JHADdQPAAAAAAQNd8UZ5xsGq7IQByLFsAgBGJg3Ai6dS+tj1KSpjdAX4UB+FrfX/PvH727TtJK943cBEH4amkqXbfV3cjHzT/FmXpVduNAPCjV09PT223AQBQszgIp5Lmks5e+NG1pKWkRZSliYdrft3xrY9Rls6rnPvZdRLt+L2iLH3leL65pA87vvXGpU/29EORtfLBw+Z1eCx7zWfXT/Ty677r2kufg5eS7ZCkB0mJtWPpqx2HsCDbpfKB3ckBh6z1va2LGtuVqGfa9qQAAA1lSURBVOK9HgfhQtLFnh9x3gZvz3vHlet7rmw7HmT3fd0F+SwYdSlpJun4gHYtlH8OrOpsV1t23NMPks4JyAHdxLIFABiwOAhfx0G4VD54PWTgdqR8YPE1DsLEBr5o1pHy1+qTpJUNhNq49j9xEF7ZYKcNx8rvxT/iIFw1cS/GQTi1wcw/kt7rsMCBlPfbW0nXcRA+xkE4b7HfCh0QOPg40m3wjvX99VvFQXhex0Us0+BOeWDjpcDBpl0flL8XFxbUGrIbUd8A6DSCBwAwUDZ4SZQ/FLs4Ux5EWHZxIDQSR5I+2KCvDe8lJR14/Y+V34uzOk5uQbaFDg+y7XOkfMB3V9cg1MUBgYN3PjOCeuxYecBq5vOkFvxKdFjQYJcL5ffUpa82dcha0q9Rls6qZloBqBfBAwAYrqUOnznd563y1Fm05yIOwrbW/54oH/R0wbXvDISt2eB9A2sXm0HowvN5SzswcLBopjW9ce0r+GMZA0vlgaUqjiR9GlhG2FLSpOmlSQDcEDwAgAGyh8t9M6hrSbdbXy9pe+YZ0vsWBw0nDS+f2Gfh60Q2u5zIfTb4EBe2BKiV99ALgYO18roCi8Ya1C8LT6/bXPsDBw/6/ll87+F6vRFl6RXZBkB/sNsCAAxTUWrrg6TZriJkNgM7s6+qM2R42Q+FI7d2wrhUceBnJn9ZAG92/Nu58qUKRdeee7r2N8+L/dl9eGrX2jWoP46D8LzqTKUFYq4P+NEb5X2ePC9aZ+eY6uXid2fKZ1inJZtZyQGBg2lD68t/U57dUZbvtv1QgPGAe+1I+Xti4XpBCz4UvQZfJF3uuK9eK79XzvccCwCNI3gAAMO0q87BZrCw2nWADSIuJV3ajOyVCCI0xl6XlaTlnkGftzX0BVXsE7v2nzu+dxwH4aTuqu92H95Zoc9Eu5feTJUPxp1spZHv81nSfN+sqPVhImlu75m5ioMIZ3EQXkVZWvuadRt8LlUchGoycCDl2w4mDV3rYAfea5WCByoOGN1GWbrz/Wz33FL5Z8Fc+X1FEAFA61i2AAADs6ci98H7hlsa80T5AAoNs4r3Dzu+dVR3+rsNqG4Kvj2p89rP2vGo4gya04qn37f+fC3pv1GWXpZJp7b3zKmK+07Kl57UWkRxq1BqUeDgXvkacyraG3udi16XScXTF92rB9UwibJ0ZZ8H/9VhS8wAoDYEDwBgeCY+ThJl6aPNkr6R//RhvKyoz6sOnKtcu1F1zFZbhkBRIdFKA2t7z8y0P+hWW+HLrcDBvt9vyhrzn1lgdVfAzkfR2V1KBQGjLL2LsnQq6aMkXj8ArSB4AAADs2fAdWZrfEufr4lUa/ykzSKVQy6QOS/497Wkcx8Da3u/FGUgHNex3R6BAy+avO+d7oEoS+dkjQBoC8EDABimXTNoUr6mfdpkQ1CeDQR3BnoaWjteFGRqdNBiWQK+z1dUk2Dms57DnqUnkuPAscgBgYObKEtPCRwUs8/FXUtZqu5+kBT8+0kchMu2duEAABcEDwBgmBYF/34k6WschIs9tRHQIhtMFBWrLBqM+rz+TLsLbn5pcvBpWTJFKf6J42mL1rXf1rTP/Kzg349dsoD2SLQ/cFDUDuhbnZiie61SwMyCfUXv27eSVnEQzgkiAOgDdlsAgGG6Uj67WVQU7kL5/vO3yivKJ001TNKHOAg/NHi9rprsyAKZav+2f94GuDuuPbHr76rqvpbn2XLHdmwsHC+3Kygi1VSHIMrSJA7CB+1+Pc/lL5OjKHBw25HAwdc4CF/6mTcNfA6dPmvHZkvEmYo/Kxcernsp6Y+C7x1J+qB8l5uFpKu6dzQBAFcEDwBggKIsfbRBWaL92y2eKX+wv1f+0Lqov3UwFyq3/dpafge5X0tc96e96Ftox8aNS1v2LNdZ15R1sLFQPjh8burxGvfaHUA4i4PwvObfr08+lfz5Wx8BjShLl3EQ3mj/+/1I0nvlO3LcSFp0cXtLAOPGsgUAGCgrqjVVPvh7yYmk6zgIV77XmcObOgfwRb4oL7K3aPi6Re7lngFRlBZedx2HpODfJx6vMVXx2vyF5yUSY/Gg4mUupVkGyMcDf/xCeVCXGjUAOoXgAQAMmAUQJtq/9/y2Y30PIkzrahdK+9jSAH4iadaR+hi3qrZbQNEAOnE836FWBf9etDSlNOuTqXYHEI6UF0olgHC4e0neC0xGWTpXvvXtoUUYN5lhFFYE0AkEDwBg4Lb2nv+XygURvsZBWNue9DjIg/K14POWrn+iPJX6nzgI22qDJL2LsrSX2ww2lS1ifTPT7kyjPgQQJm03wPxW584UtvXtqaR3OjyIsCmsOK2jTQBwKGoeAMBI2CBmZoPAmfYXVNx4Hwfha89F127kpwjZRtk18122Vp5GfycpqXmt+q4U6k0BuV3r5z/EQThpqQDfVH7vmW2Tms4r6duuEY2IsvRuT62TTQBhahlJTfpNLy8PWTXQjkOcq6YCmtssk2hhr9dML9c/2eyU8ys1LAC0heABAIyMBRHmkuZW3+BSxdXapXxXhrsoS309UK98FgI7oIp7V31sMaNA+65tA5qlfh6AXsRBuPQ5eImy9NXWdU+1e+B7EQfhY5SlVXZ8SLS7cGHdg/tJwb8fOutcyoEBhEnDWRx3HSn+921HB1uKc6ef++gsDsJFU0Eya09SIqi7iIPwlB0ZALSBZQsAMGJRli4shfZXFe9FLuWBBtbcjoQNaE61OwW+tllZmxGfFXz7fcVinquCfz+p+d4uKrq3quuC1o9F190EEEb9frbB91S77/GLppdsRVm6soDeRPsLKx4pD/4CQOMIHgAAZDPJpyquiXAkj5XH0X1bGSrPHde59truxXcF3752DSDY71O084jTOV9iA/Si901SxzU3LABU1I8nIoCwCbIUZbNUDVY5sRo1c0n/VfH9ejH21w5AOwgeAAAk/VBY8bbgR6bNtQYdUbQ8YVrnRW09eFEg67pCHYGi3+eypsHYvhT02tetWz8SQNjD+ui3gm87B6uqOmCr3S4XvwQwUAQPAADPzQv+fdJgG9ABba6rtkDWl4Jvu+4csCj492N5TgW3NfVFs9q3De7CsFDx4JgAgiSr51JHsKoSCyAsCr49ba4lAJAjeAAAAxMH4VWVh92OFDZDB3Rga7+ZdhcW/Fb4r8zJ7N4uyqzxlqZug/FdBSc35j6uc6gXBscnqm8ni954IevKKVgVB+E0DsJFxeBMUuFYAPCK4AEADM+p8ofdKpXpAanlOhe2I8BUu1O3jyQtHQZm8z3fq5ymbu1JVLyDyW0bATobHBcFEN7GQbhorjWddS6PwSpzIfdMGSnfPnWXprfbBACCBwAwUEeSPsVBmJQtbrdn8MTD6ojYILgoANXYvfBCAKF02r0N3D/v+ZFry94pPVts77WVigMHa9VUnPEQLwQQLsYeQLB77Vx+g1VSfj/86XhfzQr+vcmtNgFAEsEDABi6M0lfLXV2+tIP2+xY0RZlicd2ocNshjVRcdp9o4GkF6rin6jk9pFRll5q9wzzxntJqzgID9qi1NLTE0lfVdxnknTZZh0J6VsAoeh3J4DwfQvHXarWiNi+ryYv/bAFcs92fGvN8jIAbfil7QYAABpxoXxgcK98LXYi6S7K0kd7ED5VPsN1UXD82rbQw0DEQTgv+NappLd7Dm2s2N+2KEs3a8c/7fj2RRyEm4Hxoabav7zgSNIHSR/iILy1n13Z1+b4if33+IDrvbPihV0wVfHv7tKXL5lV2N4zaXqgHGXpXRyE7yRd7/j2pkaE65Ke7fvqi75/FifStwDu5vN4V+BAamCnDgDYheABAIzLiX19kKQ4CA89rtTMLnrhg+Nxc5+NKCPK0k0x0F1Bros4CFdRls4PPNejDWgTFQcQNs5UPJA7RJcCB4f87hdxECYe21wUlDxU4qMRZViwaqLd75O3cRAuDgiwvLS04K19lfksXqvF9yCAcWPZAgAMz7mKq4a7uD10QIbB+9x2uvQLVfE/lCl4uFVPoagOQFVrSW+6FDjYeKGWhOSheGTf2efevhoR8xeOv5P0RsV97KL1pS8AxovgAQAMTJSlj1GWTpXv7V71ofVWLVfcP8C+tevw57PVCuiCoqr4UslBr71fZpJ+lfRQvWnf3EiatB1s2YcAwsteqBHxYrDKXv+J/ASoOpXBAmB8CB4AwEDZ3u4TSR9VPoiwlvQxytKpDTC6rOvt67tb5bPnXQkcvFQVX5I2yxvKnHMZZelE0jtVCyLcSPpXlKWzHrx3NrPjUxFA2GeqCsGqrQDVG7kFER7U0QwWAONCzQMAGDAbvMwlzeMgPFc+4Jpqd4G3tfK1xUtJSw8Dn0ftTi9fVTzvc74r/6+0u92u/dFUPxRx6Z875e1bekyR9vo6RVm6snX7RfU45nLImrEB2sKCD5v3y6mKd1G4V/67JfLzvtmnll0urEDgVMV9ObMaCKsXTrWS3yVTm3O6HOPtPWw1ImYq7p/zOAhffO0tCyGx5Q6bz+Oie+tB3+8pCiQC6IRXT09PbbcBANACGxxtthy768MsKdCmZzsGrFh7Dh+2dryRpEfLBgGAzvl/K9J25dAxunsAAAAASUVORK5CYII=";

// ─── Constants ───────────────────────────────────────────────────────────────
const MARKET_TYPES = ["Intermediate", "Asia to Europe", "Transatlantic", "TimeCharter"];
const SEG_ORDER = ["Sub 10k", "City", "Inter", "J19", "Flexi", "Handy", "MR"];
const DRAFT_KEY = "tankpos_poslist_v3";
const DRAFT_META_KEY = "tankpos_poslist_meta_v3";

// ─── Load html-to-image via UMD script (no Vite URL import issues) ───────────
let _htiPromise = null;
function loadHTI() {
  if (_htiPromise) return _htiPromise;
  _htiPromise = new Promise((res, rej) => {
    if (window.htmlToImage) { res(window.htmlToImage); return; }
    const s = document.createElement("script");
    s.src = "https://unpkg.com/html-to-image/dist/html-to-image.js";
    s.onload = () => res(window.htmlToImage);
    s.onerror = () => { _htiPromise = null; rej(new Error("CDN load failed — check your internet connection.")); };
    document.head.appendChild(s);
  });
  return _htiPromise;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDwt(n) {
  if (n == null || n === "") return "";
  return Number(n).toLocaleString("en-US").replace(/,/g, " ");
}

function daysToOpen(dateStr) {
  if (!dateStr) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  return isNaN(d) ? null : Math.round((d - t) / 86400000);
}

function groupVessels(list, by) {
  const fn = by === "region"
    ? v => v.superRegion || classifyRegion(v.openPort) || "Other"
    : v => v.segment || "Other";
  const out = {};
  list.forEach(v => { const k = fn(v); if (!out[k]) out[k] = []; out[k].push(v); });
  if (by === "segment") {
    const sorted = {};
    SEG_ORDER.forEach(k => { if (out[k]) sorted[k] = out[k]; });
    Object.keys(out).forEach(k => { if (!sorted[k]) sorted[k] = out[k]; });
    return sorted;
  }
  return out;
}

function parseTags(v) {
  if (!v?.tag) return [];
  if (Array.isArray(v.tag)) return v.tag.map(t => String(t).toUpperCase().trim()).filter(Boolean);
  return String(v.tag).split(",").map(t => t.toUpperCase().trim()).filter(Boolean);
}

function fmtCoating(s) {
  return s ? String(s).toUpperCase() : "";
}

function fmtOpenDate(dateStr) {
  if (!dateStr) return "";
  try { return fmtDateShort(dateStr); } catch { return dateStr; }
}

// ─── SVG: Group bar chart ─────────────────────────────────────────────────────
function GroupBarChart({ data, accent = "#3a82f6" }) {
  if (!data?.length) return null;
  const W = 440, H = 160;
  const pad = { t: 24, r: 10, b: 28, l: 10 };
  const w = W - pad.l - pad.r, h = H - pad.t - pad.b;
  const max = Math.max(...data.map(d => d.count), 1);
  const bw = (w / data.length) * 0.55;
  const xc = i => pad.l + (i + 0.5) * (w / data.length);
  const yb = v => pad.t + h - (v / max) * h;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <text x={pad.l} y={13} fill="#dbe6f5" fontSize="11" fontWeight="700">No. of ships</text>
      {data.map((d, i) => (
        <g key={d.label}>
          <rect x={xc(i) - bw / 2} y={yb(d.count)} width={bw} height={h - (yb(d.count) - pad.t)}
            fill={accent} rx="2" />
          <text x={xc(i)} y={yb(d.count) - 5} fill="#dbe6f5" fontSize="11" textAnchor="middle">{d.count}</text>
          <text x={xc(i)} y={H - 8} fill="rgba(219,230,245,0.6)" fontSize="10" textAnchor="middle">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── SVG: Fixing window distribution ─────────────────────────────────────────
function FixingWindowChart({ vessels, accent = "#3a82f6" }) {
  const buckets = useMemo(() => {
    const b = { "PPT": 0, "1-7d": 0, "7-14d": 0, "14-21d": 0, "21-30d": 0, "30d+": 0 };
    (vessels || []).forEach(v => {
      const d = daysToOpen(v.date);
      if (d === null || d < 1) b["PPT"]++;
      else if (d <= 7) b["1-7d"]++;
      else if (d <= 14) b["7-14d"]++;
      else if (d <= 21) b["14-21d"]++;
      else if (d <= 30) b["21-30d"]++;
      else b["30d+"]++;
    });
    return Object.entries(b).filter(([, c]) => c > 0).map(([label, count]) => ({ label, count }));
  }, [vessels]);

  if (!buckets.length) return null;
  const W = 440, H = 160;
  const pad = { t: 24, r: 10, b: 28, l: 10 };
  const w = W - pad.l - pad.r, h = H - pad.t - pad.b;
  const max = Math.max(...buckets.map(d => d.count), 1);
  const bw = (w / buckets.length) * 0.55;
  const xc = i => pad.l + (i + 0.5) * (w / buckets.length);
  const yb = v => pad.t + h - (v / max) * h;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <text x={pad.l} y={13} fill="#dbe6f5" fontSize="11" fontWeight="700">Fixing window (days to open)</text>
      {buckets.map((d, i) => (
        <g key={d.label}>
          <rect x={xc(i) - bw / 2} y={yb(d.count)} width={bw} height={h - (yb(d.count) - pad.t)}
            fill={accent} rx="2" />
          <text x={xc(i)} y={yb(d.count) - 5} fill="#dbe6f5" fontSize="11" textAnchor="middle">{d.count}</text>
          <text x={xc(i)} y={H - 8} fill="rgba(219,230,245,0.6)" fontSize="10" textAnchor="middle">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Editable row in position list ───────────────────────────────────────────
function VesselRow({ v, idx, isEditing, onStartEdit, onSaveEdit, onDelete,
  onDragStart, onDragEnter, onDragEnd, isDragOver }) {
  const [vals, setVals] = useState({ ...v });
  useEffect(() => { if (isEditing) setVals({ ...v }); }, [isEditing]);
  const upd = (k, val) => setVals(p => ({ ...p, [k]: val }));
  const INP = { background: "transparent", border: "none", borderBottom: "1px solid rgba(58,130,246,0.5)", color: "#dbe6f5", fontSize: 11, width: "100%", outline: "none", padding: "1px 2px", fontFamily: "inherit" };
  const rowBg = isDragOver ? "rgba(58,130,246,0.15)" : idx % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent";
  const cols = "1.4fr 0.7fr 0.55fr 0.75fr 0.65fr 0.85fr 1.2fr 0.9fr 28px";

  if (isEditing) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: cols, background: "rgba(58,130,246,0.08)", color: "#dbe6f5", fontSize: 11, padding: "5px 8px", borderTop: "1px solid rgba(58,130,246,0.14)", gap: 2 }}>
        <input style={INP} value={vals.vessel||""} onChange={e=>upd("vessel",e.target.value)} />
        <input style={INP} value={vals.dwt||""} onChange={e=>upd("dwt",e.target.value)} />
        <input style={INP} value={vals.built||""} onChange={e=>upd("built",e.target.value)} />
        <input style={INP} value={vals.coating||""} onChange={e=>upd("coating",e.target.value)} placeholder="COATING" />
        <input style={INP} value={vals.date||""} onChange={e=>upd("date",e.target.value)} />
        <input style={INP} value={vals.openPort||""} onChange={e=>upd("openPort",e.target.value)} />
        <input style={INP} value={vals.comment||""} onChange={e=>upd("comment",e.target.value)} />
        <input style={INP} value={vals.operator||""} onChange={e=>upd("operator",e.target.value)} />
        <button onClick={() => onSaveEdit(vals)} style={{ background: "none", border: "none", color: "#43e97b", cursor: "pointer", fontSize: 13, padding: 0 }}>✓</button>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(idx)}
      onDragEnter={() => onDragEnter(idx)}
      onDragEnd={onDragEnd}
      onDragOver={e => e.preventDefault()}
      onClick={onStartEdit}
      title="Click to edit · drag to reorder"
      style={{ display: "grid", gridTemplateColumns: cols, background: rowBg, color: "#dbe6f5", fontSize: 11, padding: "4px 8px", borderTop: "1px solid rgba(58,130,246,0.14)", cursor: "grab", userSelect: "none" }}
    >
      <div>{v.vessel}</div>
      <div>{fmtDwt(v.dwt)}</div>
      <div>{v.built || ""}</div>
      <div>{fmtCoating(v.coating)}</div>
      <div style={{ color: daysToOpen(v.date) !== null && daysToOpen(v.date) < 8 ? "#fbbf24" : "#dbe6f5" }}>{fmtOpenDate(v.date)}</div>
      <div>{v.openPort || ""}</div>
      <div style={{ color: "rgba(219,230,245,0.6)" }}>{v.comment || ""}</div>
      <div>{v.operator || ""}</div>
      <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: "none", color: "rgba(239,68,68,0.6)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
    </div>
  );
}

// ─── Position List preview (the captured node) ────────────────────────────────
function PositionListPreview({ vessels, grouped, groupCounts, title, subtitle, reportDate, accent, previewRef }) {
  const dateStr = (() => {
    try { return new Date(reportDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }); }
    catch { return reportDate; }
  })();
  const COLS = "1.4fr 0.7fr 0.55fr 0.75fr 0.65fr 0.85fr 1.2fr 0.9fr";
  return (
    <div ref={previewRef} style={{ background: "#070f1c", border: "1px solid rgba(58,130,246,0.14)", fontFamily: "Inter,system-ui,sans-serif" }}>
      {/* Top bar */}
      <div style={{ background: "#0c1e3d", padding: "8px 16px", textAlign: "right" }}>
        <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{dateStr}</span>
      </div>
      {/* Logo */}
      <div style={{ background: "#fff", padding: "14px 0", textAlign: "center" }}>
        <img src={STEEM_LOGO} alt="Steem1960 Shipbrokers" style={{ height: 44 }} />
      </div>
      {/* Title */}
      <div style={{ background: "#0c1e3d", padding: "14px 16px", textAlign: "center", color: "#fff" }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.5 }}>{title}</div>
        <div style={{ fontSize: 11, opacity: 0.82, marginTop: 3 }}>{subtitle}</div>
      </div>
      {/* Table */}
      <div style={{ padding: "10px 10px 4px" }}>
        {vessels.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "rgba(219,230,245,0.4)", fontSize: 12 }}>
            No vessels in report — use the panel on the left to add vessels.
          </div>
        ) : (
          <div style={{ border: "1px solid rgba(58,130,246,0.14)" }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, background: accent, color: "#fff", fontSize: 11, fontWeight: 700, padding: "6px 8px" }}>
              <div>VESSEL</div><div>DWT</div><div>BUILT</div><div>COATING</div><div>OPEN</div><div>PORT</div><div>COMMENT</div><div>OPERATOR</div>
            </div>
            {Object.entries(grouped).map(([bucket, rows]) => (
              <div key={bucket}>
                <div style={{ background: "#0c1e3d", color: "#dbe6f5", fontSize: 11, fontWeight: 700, padding: "4px 8px", letterSpacing: 0.4 }}>{bucket}</div>
                {rows.map((v, i) => (
                  <div key={v._rid || v.vessel} style={{ display: "grid", gridTemplateColumns: COLS, background: i % 2 === 0 ? "rgba(255,255,255,0.025)" : "transparent", color: "#dbe6f5", fontSize: 11, padding: "4px 8px", borderTop: "1px solid rgba(58,130,246,0.1)" }}>
                    <div>{v.vessel}</div>
                    <div>{fmtDwt(v.dwt)}</div>
                    <div>{v.built || ""}</div>
                    <div>{fmtCoating(v.coating)}</div>
                    <div>{fmtOpenDate(v.date)}</div>
                    <div>{v.openPort || ""}</div>
                    <div style={{ color: "rgba(219,230,245,0.6)" }}>{v.comment || ""}</div>
                    <div>{v.operator || ""}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Charts */}
      {vessels.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 10px 14px" }}>
          <div style={{ background: "#0c1729", border: "1px solid rgba(58,130,246,0.12)", padding: "8px 10px" }}>
            <GroupBarChart data={groupCounts} accent={accent} />
          </div>
          <div style={{ background: "#0c1729", border: "1px solid rgba(58,130,246,0.12)", padding: "8px 10px" }}>
            <FixingWindowChart vessels={vessels} accent={accent} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ReportsTab ──────────────────────────────────────────────────────────
function ReportsTab({ selectedVessels = [], allVessels = [], selectedCargoes = [] }) {
  // ── Left panel section ────────────────────────────────────────────────────
  const [section, setSection] = useState("poslist"); // 'poslist' | 'market'

  // ── Position List state ───────────────────────────────────────────────────
  const [reportVessels, setReportVessels] = useState(() => {
    try { const s = localStorage.getItem(DRAFT_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [posTitle, setPosTitle] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_META_KEY))?.title || "CHEMS & SPECIALIZED POSITION LIST"; } catch { return "CHEMS & SPECIALIZED POSITION LIST"; }
  });
  const [posSubtitle, setPosSubtitle] = useState(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_META_KEY))?.subtitle || "10-22,000 DWT · COATED AND STST"; } catch { return "10-22,000 DWT · COATED AND STST"; }
  });
  const [posGroupBy, setPosGroupBy] = useState("segment");
  const [posDate, setPosDate] = useState(new Date().toISOString().split("T")[0]);
  const [exportStatus, setExportStatus] = useState("");
  const [editingRid, setEditingRid] = useState(null);
  const dragFrom = useRef(null);
  const dragTo = useRef(null);
  const [dragOver, setDragOver] = useState(null);
  const previewRef = useRef(null);

  // Tag filter for vessel pool
  const [tagFilter, setTagFilter] = useState(new Set());
  const [poolSearch, setPoolSearch] = useState("");

  // Track which vessels we've already imported from the prop
  const importedNames = useRef(new Set(reportVessels.map(v => v.vessel)));

  // ── Market report state ───────────────────────────────────────────────────
  const [reportType, setReportType] = useState("");
  const [commentary, setCommentary] = useState("");
  const [rateGrid, setRateGrid] = useState({});
  const [tceEarnings, setTceEarnings] = useState({});
  const [fixtures, setFixtures] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [savedReports, setSavedReports] = useState([]);

  // ── Effects ───────────────────────────────────────────────────────────────
  // Preload html-to-image on mount
  useEffect(() => { loadHTI().catch(() => {}); }, []);

  // Accumulate selectedVessels — NEVER override existing list
  useEffect(() => {
    if (!selectedVessels?.length) return;
    const toAdd = selectedVessels.filter(v => !importedNames.current.has(v.vessel))
      .map(v => ({ ...v, _rid: v.vessel + "_" + Date.now() + "_" + Math.random().toString(36).slice(2) }));
    if (toAdd.length > 0) {
      toAdd.forEach(v => importedNames.current.add(v.vessel));
      setReportVessels(prev => [...prev, ...toAdd]);
      setSection("poslist");
    }
  }, [selectedVessels]);

  // Persist vessels + meta to localStorage
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(reportVessels)); } catch {}
  }, [reportVessels]);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_META_KEY, JSON.stringify({ title: posTitle, subtitle: posSubtitle })); } catch {}
  }, [posTitle, posSubtitle]);

  // Load saved market reports
  useEffect(() => { loadSavedReports(); }, []);

  // ── Position List derived ─────────────────────────────────────────────────
  const posGrouped = useMemo(() => groupVessels(reportVessels, posGroupBy), [reportVessels, posGroupBy]);
  const posGroupCounts = useMemo(
    () => Object.entries(posGrouped).map(([label, rows]) => ({ label, count: rows.length })),
    [posGrouped]
  );
  const reportedNames = useMemo(() => new Set(reportVessels.map(v => v.vessel)), [reportVessels]);

  // All available tags from allVessels pool
  const allTags = useMemo(() => {
    const s = new Set();
    allVessels.forEach(v => parseTags(v).forEach(t => s.add(t)));
    return [...s].sort();
  }, [allVessels]);

  // Vessel pool: allVessels not yet in report, filtered by tags + search
  const vesselPool = useMemo(() => {
    return allVessels.filter(v => {
      if (reportedNames.has(v.vessel)) return false;
      if (poolSearch && !v.vessel?.toLowerCase().includes(poolSearch.toLowerCase())) return false;
      if (tagFilter.size > 0) {
        const vTags = parseTags(v);
        if (!([...tagFilter].some(t => vTags.includes(t)))) return false;
      }
      return true;
    });
  }, [allVessels, reportedNames, tagFilter, poolSearch]);

  // ── Position List actions ─────────────────────────────────────────────────
  function addFromPool(v) {
    if (reportedNames.has(v.vessel)) return;
    importedNames.current.add(v.vessel);
    setReportVessels(prev => [...prev, { ...v, _rid: v.vessel + "_" + Date.now() }]);
  }

  function deleteRow(rid) {
    setReportVessels(prev => {
      const removed = prev.find(v => v._rid === rid);
      if (removed) importedNames.current.delete(removed.vessel);
      return prev.filter(v => v._rid !== rid);
    });
    if (editingRid === rid) setEditingRid(null);
  }

  function saveEdit(rid, vals) {
    setReportVessels(prev => prev.map(v => v._rid === rid ? { ...v, ...vals } : v));
    setEditingRid(null);
  }

  function clearReport() {
    if (!window.confirm("Clear all vessels from this report?")) return;
    importedNames.current = new Set();
    setReportVessels([]);
  }

  function onDragStart(idx) { dragFrom.current = idx; }
  function onDragEnter(idx) { dragTo.current = idx; setDragOver(idx); }
  function onDragEnd() {
    if (dragFrom.current !== null && dragTo.current !== null && dragFrom.current !== dragTo.current) {
      setReportVessels(prev => {
        const arr = [...prev];
        const [item] = arr.splice(dragFrom.current, 1);
        arr.splice(dragTo.current, 0, item);
        return arr;
      });
    }
    dragFrom.current = null; dragTo.current = null; setDragOver(null);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  async function captureImg(pixelRatio = 2) {
    const lib = await loadHTI();
    if (!lib?.toPng) throw new Error("Image library not available");
    return lib.toPng(previewRef.current, { backgroundColor: "#070f1c", pixelRatio });
  }

  async function handleCopyEmail() {
    setExportStatus("Copying...");
    try {
      const lib = await loadHTI();
      if (!lib?.toBlob) throw new Error("Library not ready");
      const blob = await lib.toBlob(previewRef.current, { backgroundColor: "#070f1c", pixelRatio: 2 });
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      setExportStatus("Copied — paste directly into your email.");
    } catch (e) {
      console.error(e);
      setExportStatus("Clipboard copy failed — use Download PNG instead (then attach or paste).");
    }
  }

  async function handleDownloadPng() {
    setExportStatus("Rendering...");
    try {
      const dataUrl = await captureImg(2);
      const a = document.createElement("a");
      a.download = `positions-${posDate}.png`;
      a.href = dataUrl;
      a.click();
      setExportStatus("PNG downloaded.");
    } catch (e) {
      console.error(e);
      setExportStatus("PNG failed: " + e.message);
    }
  }

  function handlePrint() { window.print(); }

  // ── Market report fns (unchanged) ─────────────────────────────────────────
  async function loadSavedReports() {
    try {
      const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
      if (!error) setSavedReports(data || []);
    } catch {}
  }

  function initRateGrid(type) {
    const g = {
      "Intermediate": { "5kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" }, "10kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" }, "18kt": { "ARA-Dublin": "", "ARA-Thames": "", "Mongstad-ARA": "" } },
      "Asia to Europe": { "25kt": { "Singapore-ARA": "", "China-ARA": "" }, "35kt": { "Singapore-ARA": "", "China-ARA": "" }, "45kt": { "Singapore-ARA": "", "China-ARA": "" } },
      "Transatlantic": { "30kt": { "ARA-USG": "", "USG-ARA": "" }, "37kt": { "ARA-USG": "", "USG-ARA": "" } },
      "TimeCharter": { "12m": { "10k": "", "15k": "", "20k": "" }, "24m": { "10k": "", "15k": "", "20k": "" } },
    };
    setRateGrid(g[type] || {});
  }

  async function saveReport() {
    try {
      await supabase.from("reports").insert([{ report_type: reportType, report_date: reportDate, commentary, rate_grid: rateGrid, tce_earnings: tceEarnings, fixtures, quotes, selected_vessels: selectedVessels, selected_cargoes: selectedCargoes }]);
      alert("Saved."); loadSavedReports();
    } catch { alert("Save failed."); }
  }

  async function loadReport(id) {
    try {
      const { data } = await supabase.from("reports").select("*").eq("id", id).single();
      if (!data) return;
      setReportType(data.report_type); setReportDate(data.report_date); setCommentary(data.commentary || "");
      setRateGrid(data.rate_grid || {}); setTceEarnings(data.tce_earnings || {}); setFixtures(data.fixtures || []); setQuotes(data.quotes || []);
      setSection("market");
    } catch {}
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const BTN = (active, color = C.blue) => ({
    fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 5, cursor: "pointer",
    border: `1px solid ${active ? color : C.bd}`, background: active ? color : "transparent",
    color: active ? "#fff" : C.dim, fontFamily: "inherit", whiteSpace: "nowrap",
  });
  const INP_S = { background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 11, padding: "6px 9px", outline: "none", fontFamily: "inherit" };
  const ACCENT = C.blue || "#3a82f6";

  // ── Render ────────────────────────────────────────────────────────────────
  const avgRate = Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(rateGrid).flatMap(r => Object.values(r).filter(v => v)).length) || 0;
  const avgTCE = Object.values(tceEarnings).filter(v => v).map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(tceEarnings).filter(v => v).length) || 0;

  return (
    <div style={{ display: "flex", height: "100%", background: C.bg, fontFamily: "Inter,system-ui,sans-serif" }}>
      <style>{`@media print { body > * { visibility:hidden; } .pos-print-area,.pos-print-area * { visibility:visible; } .pos-print-area { position:absolute;left:0;top:0;width:100%; } }`}</style>

      {/* ── Left Sidebar ────────────────────────────────────────────────── */}
      <div style={{ width: 220, minWidth: 220, background: C.bg2, borderRight: "1px solid " + C.bd, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {/* Section tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid " + C.bd }}>
          {[["poslist", "Positions"], ["market", "Market"]].map(([k, label]) => (
            <button key={k} onClick={() => setSection(k)} style={{ flex: 1, padding: "10px 4px", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", borderBottom: section === k ? `2px solid ${ACCENT}` : "2px solid transparent", background: "transparent", color: section === k ? ACCENT : C.dim, fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>

        {section === "poslist" && (
          <>
            {/* Position list stats */}
            <div style={{ padding: "10px 12px", borderBottom: "1px solid " + C.bd }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.tx }}>{reportVessels.length} vessel{reportVessels.length !== 1 ? "s" : ""}</span>
                {reportVessels.length > 0 && (
                  <button onClick={clearReport} style={{ fontSize: 10, color: C.red, background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
                )}
              </div>
              <div style={{ fontSize: 10, color: C.faint }}>Draft auto-saved · persists across tab switches</div>
            </div>

            {/* Vessel pool */}
            <div style={{ padding: "10px 12px", borderBottom: "1px solid " + C.bd, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Add vessels</div>

              {/* Search */}
              <input value={poolSearch} onChange={e => setPoolSearch(e.target.value)} placeholder="Search vessel..." style={{ ...INP_S, width: "100%", boxSizing: "border-box" }} />

              {/* Tags */}
              {allTags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {allTags.map(t => (
                    <button key={t} onClick={() => setTagFilter(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; })}
                      style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, cursor: "pointer", border: `1px solid ${tagFilter.has(t) ? ACCENT : C.bd}`, background: tagFilter.has(t) ? ACCENT : "transparent", color: tagFilter.has(t) ? "#fff" : C.dim, fontFamily: "inherit" }}>
                      {t}
                    </button>
                  ))}
                  {tagFilter.size > 0 && <button onClick={() => setTagFilter(new Set())} style={{ fontSize: 9, color: C.red, background: "none", border: "none", cursor: "pointer" }}>✕</button>}
                </div>
              )}

              {/* Pool list */}
              <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 2, maxHeight: 280 }}>
                {vesselPool.length === 0 ? (
                  <div style={{ fontSize: 10, color: C.faint, padding: "8px 0", textAlign: "center" }}>
                    {allVessels.length === 0 ? "Select vessels on Positions tab first" : "All vessels already added"}
                  </div>
                ) : vesselPool.map(v => (
                  <div key={v.vessel} onClick={() => addFromPool(v)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderRadius: 4, background: C.bg3, cursor: "pointer", border: "1px solid transparent" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = ACCENT; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.tx }}>{v.vessel}</div>
                      <div style={{ fontSize: 9, color: C.faint }}>{v.segment || ""}{v.dwt ? ` · ${fmtDwt(v.dwt)}` : ""}</div>
                    </div>
                    <span style={{ fontSize: 14, color: ACCENT, fontWeight: 700 }}>+</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Saved position list reports */}
            <div style={{ padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Saved</div>
              {savedReports.filter(r => r.report_type === "Position List").map(r => (
                <div key={r.id} onClick={() => loadReport(r.id)} style={{ padding: "6px 8px", borderRadius: 4, background: C.bg3, cursor: "pointer", marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>Position List</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {section === "market" && (
          <>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid " + C.bd }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Report type</div>
              {MARKET_TYPES.map(t => (
                <button key={t} onClick={() => { setReportType(t); initRateGrid(t); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4, borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: reportType === t ? 700 : 400, border: `1px solid ${reportType === t ? ACCENT : C.bd}`, background: reportType === t ? "rgba(58,130,246,0.1)" : "transparent", color: reportType === t ? ACCENT : C.dim, fontFamily: "inherit" }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ padding: "10px 12px", overflowY: "auto", flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>Saved reports</div>
              {savedReports.filter(r => r.report_type !== "Position List").map(r => (
                <div key={r.id} onClick={() => loadReport(r.id)} style={{ padding: "6px 8px", borderRadius: 4, background: C.bg3, cursor: "pointer", marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>{r.report_type}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{new Date(r.report_date).toLocaleDateString("en-GB")}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* ── POSITION LIST ─────────────────────────────────────────────── */}
        {section === "poslist" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.bg2, borderBottom: "1px solid " + C.bd, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>Position List</span>
              <input type="date" value={posDate} onChange={e => setPosDate(e.target.value)} style={{ ...INP_S }} />
              <button onClick={() => setPosGroupBy("segment")} style={BTN(posGroupBy === "segment")}>By Segment</button>
              <button onClick={() => setPosGroupBy("region")} style={BTN(posGroupBy === "region")}>By Region</button>
              <div style={{ flex: 1 }} />
              <button onClick={handleCopyEmail} style={BTN(false, "#f5a623")} onMouseEnter={e => { e.currentTarget.style.background = "#f5a623"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dim; }}>Copy for Email</button>
              <button onClick={handleDownloadPng} style={BTN(false)} onMouseEnter={e => { e.currentTarget.style.background = ACCENT; e.currentTarget.style.color = "#fff"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dim; }}>Download PNG</button>
              <button onClick={handlePrint} style={BTN(false)} onMouseEnter={e => { e.currentTarget.style.background = "#6366f1"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.dim; }}>Print / PDF</button>
            </div>
            {exportStatus && <div style={{ fontSize: 11, color: C.dim, padding: "4px 12px", background: C.bg3 }}>{exportStatus}</div>}

            {/* Editable title/subtitle */}
            <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: C.bg3, borderBottom: "1px solid " + C.bd }}>
              <input value={posTitle} onChange={e => setPosTitle(e.target.value)} style={{ ...INP_S, flex: 2 }} placeholder="Report title" />
              <input value={posSubtitle} onChange={e => setPosSubtitle(e.target.value)} style={{ ...INP_S, flex: 3 }} placeholder="Subtitle" />
            </div>

            {/* Editable rows + preview split */}
            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Editable vessel list */}
              {reportVessels.length > 0 && (
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 6 }}>
                  <div style={{ padding: "6px 10px", fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: "1px solid " + C.bd }}>
                    Vessels in report · click to edit · drag to reorder
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 0.55fr 0.75fr 0.65fr 0.85fr 1.2fr 0.9fr 28px", background: ACCENT, color: "#fff", fontSize: 10, fontWeight: 700, padding: "5px 8px" }}>
                    <div>VESSEL</div><div>DWT</div><div>BUILT</div><div>COATING</div><div>OPEN</div><div>PORT</div><div>COMMENT</div><div>OPERATOR</div><div></div>
                  </div>
                  {reportVessels.map((v, idx) => (
                    <VesselRow key={v._rid || idx} v={v} idx={idx}
                      isEditing={editingRid === (v._rid || idx)}
                      onStartEdit={() => setEditingRid(editingRid === (v._rid || idx) ? null : (v._rid || idx))}
                      onSaveEdit={vals => saveEdit(v._rid || idx, vals)}
                      onDelete={() => deleteRow(v._rid || idx)}
                      onDragStart={onDragStart} onDragEnter={onDragEnter} onDragEnd={onDragEnd}
                      isDragOver={dragOver === idx}
                    />
                  ))}
                </div>
              )}

              {/* Print-captured preview */}
              <div className="pos-print-area">
                <PositionListPreview
                  vessels={reportVessels}
                  grouped={posGrouped}
                  groupCounts={posGroupCounts}
                  title={posTitle}
                  subtitle={posSubtitle}
                  reportDate={posDate}
                  accent={ACCENT}
                  previewRef={previewRef}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── MARKET REPORTS ─────────────────────────────────────────────── */}
        {section === "market" && (
          <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {!reportType ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
                <div style={{ textAlign: "center", color: C.dim }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Select a report type from the left panel</div>
                </div>
              </div>
            ) : (
              <>
                {/* Market report header */}
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: ACCENT }}>{reportType}</span>
                    <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={INP_S} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={saveReport} style={{ ...BTN(true, "#3fb950") }}>Save</button>
                    <button onClick={() => window.print()} style={{ ...BTN(true, "#6366f1") }}>Print</button>
                    <button onClick={async () => { try { await navigator.clipboard.writeText(`${reportType} · ${reportDate}\n\n${commentary}`); } catch {} }} style={{ ...BTN(true, "#f5a623") }}>Copy</button>
                  </div>
                </div>

                {/* KPI */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                  {[["Average Rate", avgRate > 0 ? avgRate.toFixed(0) : "—", "WS Points", "rgba(102,126,234,0.12)", "rgba(102,126,234,0.3)", ACCENT],
                    ["Average TCE", avgTCE > 0 ? `$${avgTCE.toFixed(0)}` : "—", "per day", "rgba(63,185,80,0.12)", "rgba(63,185,80,0.3)", "#3fb950"],
                    ["Market Activity", fixtures.length + quotes.length, `${fixtures.length} fix · ${quotes.length} quotes`, "rgba(245,166,35,0.12)", "rgba(245,166,35,0.3)", "#f5a623"]
                  ].map(([label, val, sub, bg, border, col]) => (
                    <div key={label} style={{ background: `linear-gradient(135deg,${bg} 0%,${bg} 100%)`, border: `1px solid ${border}`, borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 10, color: C.dim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                      <div style={{ fontSize: 26, fontWeight: 700, color: col }}>{val}</div>
                      <div style={{ fontSize: 10, color: C.faint, marginTop: 4 }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Rate grid */}
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Freight Rates</div>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                    <thead><tr>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>Size</th>
                      {Object.keys(rateGrid).length > 0 && Object.keys(Object.values(rateGrid)[0] || {}).map(r => (
                        <th key={r} style={{ padding: "6px 10px", textAlign: "center", fontSize: 10, fontWeight: 700, color: C.dim, textTransform: "uppercase" }}>{r}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {Object.keys(rateGrid).map(size => (
                        <tr key={size}>
                          <td style={{ padding: "6px 10px", background: C.bg3, borderRadius: "5px 0 0 5px", fontSize: 12, fontWeight: 700, color: C.tx }}>{size}</td>
                          {Object.keys(rateGrid[size]).map((route, j, arr) => (
                            <td key={route} style={{ padding: "3px 6px", background: C.bg3, borderRadius: j === arr.length - 1 ? "0 5px 5px 0" : 0, textAlign: "center" }}>
                              <input type="text" value={rateGrid[size][route]} onChange={e => setRateGrid(p => ({ ...p, [size]: { ...p[size], [route]: e.target.value } }))} placeholder="WS"
                                style={{ width: "100%", background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 12, padding: "5px 8px", textAlign: "center", outline: "none" }} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* TCE */}
                {reportType !== "TimeCharter" && (
                  <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Indicative TCE ($/day)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                      {["10k", "15k", "20k"].map(seg => (
                        <div key={seg}>
                          <label style={{ display: "block", fontSize: 10, color: C.dim, marginBottom: 5, fontWeight: 700, textTransform: "uppercase" }}>{seg}</label>
                          <input type="text" value={tceEarnings[seg] || ""} onChange={e => setTceEarnings(p => ({ ...p, [seg]: e.target.value }))} placeholder="$"
                            style={{ width: "100%", background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 13, padding: "8px 10px", outline: "none", boxSizing: "border-box" }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commentary */}
                <div style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 12 }}>Market Commentary</div>
                  <textarea value={commentary} onChange={e => setCommentary(e.target.value)} placeholder="Market analysis, trends, outlook..."
                    style={{ width: "100%", minHeight: 90, background: C.bg3, border: "1px solid " + C.bd, borderRadius: 5, color: C.tx, fontSize: 12, padding: 10, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }} />
                </div>

                {/* Fixtures & Quotes */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Recent Fixtures", fixtures, setFixtures, ["vessel", "charterer", "route", "qty", "rate"]],
                    ["Market Quotes", quotes, setQuotes, ["route", "size", "rate", "basis"]]].map(([label, list, setList, fields]) => (
                    <div key={label} style={{ background: C.bg2, border: "1px solid " + C.bd, borderRadius: 8, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{label}</div>
                        <button onClick={() => setList(p => [...p, Object.fromEntries(fields.map(f => [f, ""]))])}
                          style={{ background: ACCENT, border: "none", borderRadius: 4, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 9px", cursor: "pointer" }}>+ Add</button>
                      </div>
                      {list.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: C.faint, fontSize: 11 }}>None added yet</div> : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {list.map((item, i) => (
                            <div key={i} style={{ background: C.bg3, borderRadius: 5, padding: 8, border: "1px solid " + C.bd }}>
                              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                <button onClick={() => setList(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13 }}>✕</button>
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: fields.length > 3 ? "1fr 1fr" : "1fr", gap: 5 }}>
                                {fields.map(f => (
                                  <input key={f} type="text" value={item[f] || ""} onChange={e => setList(p => { const n = [...p]; n[i] = { ...n[i], [f]: e.target.value }; return n; })}
                                    placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                                    style={{ background: C.bg, border: "1px solid " + C.bd, borderRadius: 4, color: C.tx, fontSize: 11, padding: "4px 6px", outline: "none" }} />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportsTab;
